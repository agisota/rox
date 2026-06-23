/**
 * Admin router (WS-F — admin expansion).
 *
 * Per-user drilldown + feature-flag toggles for the `apps/admin` dashboard. All
 * procedures are gated by {@link adminProcedure} (`@rox.one` email). This router
 * is READ-mostly: the only write is `setUserFlag`, which delegates to the
 * WS-O-owned flag-override helpers (`@rox/db/utils`). Balance-mutating writes
 * (bonus grants) are NOT here — the admin UI calls the WS-E-owned
 * `economy.admin.grant` mutation directly (single-writer rule).
 */

import { db } from "@rox/db/client";
import {
	members,
	roxBalances,
	roxLedger,
	sessions,
	usageRequests,
	users,
} from "@rox/db/schema";
import { resolveUserFlag, upsertUserFlagOverride } from "@rox/db/utils";
import { FEATURE_FLAGS } from "@rox/shared/constants";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, ilike, lt, or } from "drizzle-orm";
import { z } from "zod";

import { posthog } from "../../lib/analytics";
import { adminProcedure } from "../../trpc";

/**
 * Payload-shaped flags cannot be represented by a boolean override
 * (`RELAY_URL_OVERRIDE` carries `{ url }`), so they are excluded from the admin
 * toggle surface (WS-F hardening (b)4). All remaining flags are boolean.
 */
const PAYLOAD_FLAG_KEYS = new Set<string>([FEATURE_FLAGS.RELAY_URL_OVERRIDE]);

/** Human-readable descriptions for the boolean flags the admin can toggle. */
const FLAG_DESCRIPTIONS: Record<string, string> = {
	[FEATURE_FLAGS.ELECTRIC_TASKS_ACCESS]: "Experimental Electric SQL tasks.",
	[FEATURE_FLAGS.WEB_AGENTS_UI_ACCESS]:
		"Experimental mobile-first agents UI on web.",
	[FEATURE_FLAGS.GITHUB_INTEGRATION_ACCESS]: "GitHub integration (internal).",
	[FEATURE_FLAGS.CLOUD_ACCESS]: "Cloud features (env vars, sandboxes).",
	[FEATURE_FLAGS.DISABLE_REMOTE_AGENT]:
		"Block remote agent execution on desktop.",
	[FEATURE_FLAGS.SLACK_MCP_V2]: "Route the Slack agent to the v2 MCP server.",
};

/** The boolean flag keys exposed in the admin toggle list. */
const TOGGLEABLE_FLAG_KEYS = Object.values(FEATURE_FLAGS).filter(
	(key) => !PAYLOAD_FLAG_KEYS.has(key),
);

const userIdInput = z.object({ userId: z.string().uuid() });

/** Coerce a PostHog flag value (boolean | string | undefined) to a boolean. */
function posthogToBool(value: boolean | string | undefined): boolean {
	return value === true || (typeof value === "string" && value.length > 0);
}

export const adminRouter = {
	/**
	 * Paginated + searchable user list (T1). Keyset paginates on
	 * `createdAt,id` (newest first); `q` filters name/email (case-insensitive).
	 * Additive over the legacy all-load list — all inputs are optional.
	 */
	listUsers: adminProcedure
		.input(
			z
				.object({
					q: z.string().trim().min(1).max(200).optional(),
					limit: z.number().int().min(1).max(100).default(50),
					cursor: z.string().datetime().optional(),
				})
				.default({ limit: 50 }),
		)
		.query(async ({ input }) => {
			const filters = [];
			if (input.q) {
				const pattern = `%${input.q}%`;
				filters.push(
					or(ilike(users.email, pattern), ilike(users.name, pattern)),
				);
			}
			if (input.cursor) {
				filters.push(lt(users.createdAt, new Date(input.cursor)));
			}

			const rows = await db
				.select({
					id: users.id,
					name: users.name,
					email: users.email,
					image: users.image,
					createdAt: users.createdAt,
				})
				.from(users)
				.where(filters.length ? and(...filters) : undefined)
				.orderBy(desc(users.createdAt), desc(users.id))
				.limit(input.limit + 1);

			const hasMore = rows.length > input.limit;
			const items = hasMore ? rows.slice(0, input.limit) : rows;
			const nextCursor = hasMore
				? items[items.length - 1]?.createdAt.toISOString()
				: undefined;

			return { users: items, nextCursor };
		}),

	/** Profile + organization memberships for one user (T2). */
	getUser: adminProcedure.input(userIdInput).query(async ({ input }) => {
		const user = await db.query.users.findFirst({
			where: eq(users.id, input.userId),
			columns: {
				id: true,
				name: true,
				email: true,
				image: true,
				emailVerified: true,
				onboardedAt: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		if (!user) {
			throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
		}

		const memberships = await db.query.members.findMany({
			where: eq(members.userId, input.userId),
			orderBy: desc(members.createdAt),
			with: { organization: true },
		});

		const organizationsList = memberships
			.filter((m) => m.organization)
			.map((m) => ({
				role: m.role,
				joinedAt: m.createdAt,
				organization: m.organization,
			}));

		return { user, organizations: organizationsList };
	}),

	/**
	 * Read-only balance + recent ledger for an arbitrary user (T3). Unlike
	 * `user.accountOverview`, this does NOT seed a `roxBalances` row — admin
	 * viewing must never materialize user state. Falls back to the "500" default
	 * when the user has no row yet.
	 */
	getUserBalance: adminProcedure.input(userIdInput).query(async ({ input }) => {
		const balance = await db.query.roxBalances.findFirst({
			where: eq(roxBalances.userId, input.userId),
			columns: { balanceRox: true, updatedAt: true },
		});

		const ledger = await db
			.select({
				id: roxLedger.id,
				deltaRox: roxLedger.deltaRox,
				kind: roxLedger.kind,
				usageRequestId: roxLedger.usageRequestId,
				topupId: roxLedger.topupId,
				createdAt: roxLedger.createdAt,
			})
			.from(roxLedger)
			.where(eq(roxLedger.userId, input.userId))
			.orderBy(desc(roxLedger.createdAt))
			.limit(100);

		return {
			balanceRox: balance?.balanceRox ?? "500",
			updatedAt: balance?.updatedAt ?? null,
			ledger,
		};
	}),

	/** Recent usage requests for a user (T4). Cost lives on `usageRequests`. */
	getUserUsage: adminProcedure.input(userIdInput).query(async ({ input }) => {
		const requests = await db
			.select({
				id: usageRequests.id,
				organizationId: usageRequests.organizationId,
				chatSessionId: usageRequests.chatSessionId,
				modelId: usageRequests.modelId,
				tokensIn: usageRequests.tokensIn,
				tokensOut: usageRequests.tokensOut,
				usdCost: usageRequests.usdCost,
				roxCost: usageRequests.roxCost,
				createdAt: usageRequests.createdAt,
			})
			.from(usageRequests)
			.where(eq(usageRequests.userId, input.userId))
			.orderBy(desc(usageRequests.createdAt))
			.limit(500);

		return { requests };
	}),

	/** Active/expired sessions for a user (T4). */
	getUserSessions: adminProcedure
		.input(userIdInput)
		.query(async ({ input }) => {
			const rows = await db
				.select({
					id: sessions.id,
					expiresAt: sessions.expiresAt,
					createdAt: sessions.createdAt,
					ipAddress: sessions.ipAddress,
					userAgent: sessions.userAgent,
				})
				.from(sessions)
				.where(eq(sessions.userId, input.userId))
				.orderBy(desc(sessions.createdAt))
				.limit(100);

			return { sessions: rows };
		}),

	/**
	 * Per-user feature-flag matrix (T5). For each boolean flag returns the DB
	 * override (`true`/`false`/`null=inherit`) and the effective value
	 * (override ?? PostHog). Payload flags are excluded.
	 */
	getUserFlags: adminProcedure.input(userIdInput).query(async ({ input }) => {
		const flags = await Promise.all(
			TOGGLEABLE_FLAG_KEYS.map(async (key) => {
				const override = await resolveUserFlag({ userId: input.userId, key });
				let effective: boolean;
				if (override !== null) {
					effective = override;
				} else {
					const phValue = await posthog.getFeatureFlag(key, input.userId);
					effective = posthogToBool(phValue);
				}
				return {
					key,
					description: FLAG_DESCRIPTIONS[key] ?? key,
					override,
					effective,
				};
			}),
		);

		return { flags };
	}),

	/**
	 * Toggle a per-user flag override (T5). `value: true|false` forces the flag;
	 * `value: null` clears the override (the user inherits PostHog again).
	 * Unknown and payload flags are rejected. Delegates the write to the
	 * WS-O-owned helper (single writer for the override table).
	 */
	setUserFlag: adminProcedure
		.input(
			z.object({
				userId: z.string().uuid(),
				key: z.string(),
				value: z.boolean().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (
				!TOGGLEABLE_FLAG_KEYS.includes(
					input.key as (typeof TOGGLEABLE_FLAG_KEYS)[number],
				)
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Unknown or non-toggleable feature flag: ${input.key}`,
				});
			}

			await upsertUserFlagOverride({
				userId: input.userId,
				key: input.key,
				value: input.value,
				updatedBy: ctx.session.user.id,
			});

			return { success: true };
		}),

	deleteUser: adminProcedure
		.input(z.object({ userId: z.string() }))
		.mutation(async ({ input }) => {
			// Delete user - Better Auth handles cascading session cleanup.
			await db.delete(users).where(eq(users.id, input.userId));
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
