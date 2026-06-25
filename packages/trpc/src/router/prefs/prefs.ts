import { db, dbWs } from "@rox/db/client";
import { orgSettings, userPreferences } from "@rox/db/schema";
import { findOrgMembership, getCurrentTxid } from "@rox/db/utils";
import {
	applyOrgSettingsPatch,
	applyUserPreferencesPatch,
	emptyOrgSettingsDoc,
	emptyUserPreferencesDoc,
	type OrgSettingsDoc,
	orgSettingsDocSchema,
	type UserPreferencesDoc,
	userPreferencesDocSchema,
} from "@rox/shared/prefs";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { updateOrgSettingsSchema, updateUserPreferencesSchema } from "./schema";

/**
 * Cross-device preferences sync router (F46, Hermes-borrow #643).
 *
 * The single backend that makes "a pin on desktop = a pin on phone" true. Two
 * documents, both upserted with per-field LWW reconcile so a late offline write
 * never clobbers a newer field set on another device:
 *
 *   user — per-(org, user) prefs: pins/tagPrefs/savedViews/disclosure/locale/
 *          rightPanelPeek. Org-membership scoped.
 *   org  — per-org settings: defaultLocale/defaultTagPrefs/sharedViews.
 *          Owner/admin only to write (every member may read).
 *
 * Writes run on `dbWs` and return the post-commit Electric txid so the desktop /
 * mobile collections can await their own mutation landing in the synced shape
 * (mirrors `ambientRouter` / `memoryRouter`).
 */

/** Coerce a possibly-legacy/partial stored jsonb into a full document. */
function readUserDoc(raw: unknown): UserPreferencesDoc {
	const parsed = userPreferencesDocSchema.safeParse(raw);
	return parsed.success ? parsed.data : emptyUserPreferencesDoc();
}

function readOrgDoc(raw: unknown): OrgSettingsDoc {
	const parsed = orgSettingsDocSchema.safeParse(raw);
	return parsed.success ? parsed.data : emptyOrgSettingsDoc();
}

export const prefsRouter = {
	/** Read the signed-in user's prefs document (defaults when no row yet). */
	get: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const [row] = await db
			.select({ values: userPreferences.values })
			.from(userPreferences)
			.where(
				and(
					eq(userPreferences.organizationId, organizationId),
					eq(userPreferences.createdBy, ctx.session.user.id),
				),
			)
			.limit(1);
		return readUserDoc(row?.values);
	}),

	/**
	 * Upsert a partial prefs patch with per-field LWW. The patch's `updatedAt`
	 * (the client's on-device stamp) wins a field only when it is strictly newer
	 * than the field's stored timestamp, so reconnecting an offline device can
	 * never clobber a newer field written elsewhere.
	 */
	update: protectedProcedure
		.input(updateUserPreferencesSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			return dbWs.transaction(async (tx) => {
				const [existing] = await tx
					.select({ values: userPreferences.values })
					.from(userPreferences)
					.where(
						and(
							eq(userPreferences.organizationId, organizationId),
							eq(userPreferences.createdBy, userId),
						),
					)
					.limit(1);
				const base = readUserDoc(existing?.values);
				const merged = applyUserPreferencesPatch(
					base,
					input.patch,
					input.updatedAt,
				);
				await tx
					.insert(userPreferences)
					.values({ organizationId, createdBy: userId, values: merged })
					.onConflictDoUpdate({
						target: [userPreferences.organizationId, userPreferences.createdBy],
						set: { values: merged, updatedAt: new Date() },
					});
				const txid = await getCurrentTxid(tx);
				return { txid, values: merged };
			});
		}),

	/** Read the active org's settings document (every member may read). */
	getOrg: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const [row] = await db
			.select({ values: orgSettings.values })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, organizationId))
			.limit(1);
		return readOrgDoc(row?.values);
	}),

	/** Upsert org settings with per-field LWW. Owner/admin only. */
	updateOrg: protectedProcedure
		.input(updateOrgSettingsSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const membership = await findOrgMembership({
				userId: ctx.session.user.id,
				organizationId,
			});
			if (
				!membership ||
				(membership.role !== "owner" && membership.role !== "admin")
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only owners or admins can update organization settings",
				});
			}
			return dbWs.transaction(async (tx) => {
				const [existing] = await tx
					.select({ values: orgSettings.values })
					.from(orgSettings)
					.where(eq(orgSettings.organizationId, organizationId))
					.limit(1);
				const base = readOrgDoc(existing?.values);
				const merged = applyOrgSettingsPatch(
					base,
					input.patch,
					input.updatedAt,
				);
				await tx
					.insert(orgSettings)
					.values({ organizationId, values: merged })
					.onConflictDoUpdate({
						target: [orgSettings.organizationId],
						set: { values: merged, updatedAt: new Date() },
					});
				const txid = await getCurrentTxid(tx);
				return { txid, values: merged };
			});
		}),
} satisfies TRPCRouterRecord;
