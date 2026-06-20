/**
 * XMPP tRPC router — the D4 JID provisioning + binding API surface (Phase 1).
 *
 * Every procedure is org-scoped via `requireActiveOrgMembership` (the comms /
 * calendar pattern) and operates on the CALLER's own user only — a JID is GLOBAL
 * per user (DQ3), so there is no cross-user read here. `provisionJid` derives the
 * JID from the caller's `user_profiles.handle` (ROX-522), runs the whole bind /
 * rename inside one `dbWs.transaction` (so a rename can't half-apply), and
 * honors DQ4 (permanent reservation + 90-day alias). `listBindings` / `status`
 * surface the caller's account + reserved aliases.
 *
 * GATED: the whole surface is inert unless `XMPP_FEDERATION_ENABLED` is truthy
 * (mirrors the collab/rtc/mail env gating). When disabled every procedure throws
 * PRECONDITION_FAILED so the schema can ship ahead of the ejabberd deploy wave.
 */

import { dbWs } from "@rox/db/client";
import { userProfiles, xmppAccounts, xmppJidAliases } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { createProvisionJidDb } from "../../lib/xmpp/drizzleDb";
import { provisionJid } from "../../lib/xmpp/provisionJid";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { getBindingSchema, provisionJidSchema } from "./schema";

/** The federation feature gate (env, additive/optional). */
function federationEnabled(): boolean {
	const v = process.env.XMPP_FEDERATION_ENABLED;
	return v === "1" || v === "true";
}

/** The XMPP service domain (env override, additive/optional). */
function xmppDomain(): string | undefined {
	const v = process.env.XMPP_DOMAIN;
	return v && v.length > 0 ? v : undefined;
}

function requireFederation() {
	if (!federationEnabled()) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "XMPP federation is not enabled",
		});
	}
}

export const xmppRouter = {
	/**
	 * Provision (or re-affirm / rename) the caller's JID binding, derived from
	 * their `user_profiles.handle`. Idempotent; a rename frees the old localpart
	 * as a permanently-reserved 90-day-grace alias (DQ4).
	 */
	provisionJid: protectedProcedure
		.input(provisionJidSchema)
		.mutation(async ({ ctx, input }) => {
			requireFederation();
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			const [profile] = await dbWs
				.select({ handle: userProfiles.handle })
				.from(userProfiles)
				.where(eq(userProfiles.userId, userId))
				.limit(1);
			if (!profile?.handle) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Set a handle before provisioning a JID",
				});
			}

			return dbWs.transaction(async (tx) => {
				const db = createProvisionJidDb(tx);
				return provisionJid(db, {
					userId,
					handle: profile.handle as string,
					organizationId,
					domain: input?.domain ?? xmppDomain(),
				});
			});
		}),

	/** The caller's JID account + its reserved aliases (DQ4 history). */
	listBindings: protectedProcedure
		.input(getBindingSchema)
		.query(async ({ ctx }) => {
			requireFederation();
			await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			const [account] = await dbWs
				.select()
				.from(xmppAccounts)
				.where(eq(xmppAccounts.userId, userId))
				.limit(1);
			if (!account) return { account: null, aliases: [] };

			const aliases = await dbWs
				.select()
				.from(xmppJidAliases)
				.where(eq(xmppJidAliases.accountId, account.id));

			return { account, aliases };
		}),

	/** The caller's JID + status (a compact health probe for the UI). */
	status: protectedProcedure.input(getBindingSchema).query(async ({ ctx }) => {
		requireFederation();
		await requireActiveOrgMembership(ctx);
		const userId = ctx.session.user.id;

		const [account] = await dbWs
			.select({
				jidLocalpart: xmppAccounts.jidLocalpart,
				domain: xmppAccounts.domain,
				status: xmppAccounts.status,
			})
			.from(xmppAccounts)
			.where(eq(xmppAccounts.userId, userId))
			.limit(1);

		if (!account) {
			return { provisioned: false as const, jid: null, status: null };
		}
		return {
			provisioned: true as const,
			jid: `${account.jidLocalpart}@${account.domain}`,
			status: account.status,
		};
	}),
} satisfies TRPCRouterRecord;
