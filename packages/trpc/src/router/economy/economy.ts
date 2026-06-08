/**
 * Rox economy tRPC router (billing-economy epic, be-05).
 *
 *   balance  → current Rox balance (auto-seeds 500 Rox on first read)
 *   history  → paginated append-only ledger
 *   usage    → paginated metered-request log (cost + Rox per request)
 *   topUp    → open a dv.net USDT → Rox top-up invoice
 *
 * The atomic per-request debit lives in `./charge.ts` and is consumed by the
 * request execution path (be-09).
 */

import { db } from "@rox/db/client";
import {
	roxBalances,
	roxLedger,
	roxTopups,
	subscriptions,
	usageRequests,
} from "@rox/db/schema";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@rox/shared/billing";
import { type RoxPlanTier, resolveTier } from "@rox/shared/rox-perks";
import {
	ROX_PER_USDT,
	STARTING_BALANCE_ROX,
	usdToRox,
} from "@rox/shared/rox-pricing";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";

const paginationInput = z.object({
	limit: z.number().int().min(1).max(100).default(20),
	/** ISO timestamp; return rows strictly older than this (keyset paging). */
	cursor: z.string().datetime().optional(),
});

/** Resolve the caller's perk tier from their active org subscription. */
async function resolveCallerTier(
	activeOrganizationId: string | null,
): Promise<RoxPlanTier> {
	if (!activeOrganizationId) return "free";
	const subscription = await db.query.subscriptions.findFirst({
		where: and(
			eq(subscriptions.referenceId, activeOrganizationId),
			inArray(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
		),
		orderBy: desc(subscriptions.createdAt),
	});
	return resolveTier(subscription?.status ?? null);
}

/** Read the balance, seeding {@link STARTING_BALANCE_ROX} on first access. */
async function readOrSeedBalance(userId: string): Promise<number> {
	const existing = await db.query.roxBalances.findFirst({
		where: eq(roxBalances.userId, userId),
	});
	if (existing) return Number(existing.balanceRox);

	await db
		.insert(roxBalances)
		.values({ userId, balanceRox: String(STARTING_BALANCE_ROX) })
		.onConflictDoNothing();
	await db
		.insert(roxLedger)
		.values({
			userId,
			deltaRox: String(STARTING_BALANCE_ROX),
			kind: "seed",
		})
		.onConflictDoNothing();
	return STARTING_BALANCE_ROX;
}

export const economyRouter = {
	balance: protectedProcedure.query(async ({ ctx }) => {
		const balanceRox = await readOrSeedBalance(ctx.session.user.id);
		const tier = await resolveCallerTier(ctx.activeOrganizationId);
		return {
			balanceRox,
			balanceUsdt: balanceRox / ROX_PER_USDT,
			tier,
		};
	}),

	history: protectedProcedure
		.input(paginationInput)
		.query(async ({ ctx, input }) => {
			const rows = await db.query.roxLedger.findMany({
				where: and(
					eq(roxLedger.userId, ctx.session.user.id),
					input.cursor
						? lt(roxLedger.createdAt, new Date(input.cursor))
						: undefined,
				),
				orderBy: desc(roxLedger.createdAt),
				limit: input.limit + 1,
			});

			const hasMore = rows.length > input.limit;
			const items = rows.slice(0, input.limit).map((row) => ({
				id: row.id,
				deltaRox: Number(row.deltaRox),
				kind: row.kind,
				usageRequestId: row.usageRequestId,
				topupId: row.topupId,
				createdAt: row.createdAt,
			}));
			const nextCursor = hasMore
				? items[items.length - 1]?.createdAt.toISOString()
				: undefined;

			return { items, nextCursor };
		}),

	usage: protectedProcedure
		.input(paginationInput)
		.query(async ({ ctx, input }) => {
			const rows = await db.query.usageRequests.findMany({
				where: and(
					eq(usageRequests.userId, ctx.session.user.id),
					input.cursor
						? lt(usageRequests.createdAt, new Date(input.cursor))
						: undefined,
				),
				orderBy: desc(usageRequests.createdAt),
				limit: input.limit + 1,
			});

			const hasMore = rows.length > input.limit;
			const items = rows.slice(0, input.limit).map((row) => ({
				id: row.id,
				modelId: row.modelId,
				tokensIn: row.tokensIn,
				tokensOut: row.tokensOut,
				usdCost: Number(row.usdCost),
				roxCost: Number(row.roxCost),
				trace: row.trace,
				createdAt: row.createdAt,
			}));
			const nextCursor = hasMore
				? items[items.length - 1]?.createdAt.toISOString()
				: undefined;

			return { items, nextCursor };
		}),

	topUp: protectedProcedure
		.input(
			z.object({
				usdtAmount: z.number().positive().max(100_000),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const roxAmount = usdToRox(input.usdtAmount);
			// dv.net invoice creation lives in be-04's client; until that lands we
			// open a pending top-up row keyed by a locally-generated invoice id.
			const dvnetInvoiceId = `dvnet_${crypto.randomUUID()}`;

			const [topup] = await db
				.insert(roxTopups)
				.values({
					userId: ctx.session.user.id,
					usdtAmount: String(input.usdtAmount),
					roxAmount: String(roxAmount),
					dvnetInvoiceId,
					status: "pending",
				})
				.returning({ id: roxTopups.id });

			if (!topup) {
				throw new Error("Failed to open top-up invoice");
			}

			return {
				topupId: topup.id,
				dvnetInvoiceId,
				usdtAmount: input.usdtAmount,
				roxAmount,
				status: "pending" as const,
			};
		}),
} satisfies TRPCRouterRecord;
