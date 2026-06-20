/**
 * Economy tRPC router (WS-E T3 + T6).
 *
 * Keeps the prepaid Rox economy's user-facing reads together, separate from the
 * auth-shaped `user` router:
 *  - `balance` — current Rox balance (seeds {@link STARTING_BALANCE_ROX} on first
 *    read via {@link ensureBalance}).
 *  - `ledger`  — paginated `rox_ledger` history (createdAt-desc cursor).
 *  - `usage`   — paginated `usage_requests` for the user/active org.
 *  - `admin.grant` — admin-only bonus-Rox grant (T6); the procedure WS-F's admin
 *    UI consumes (`trpc.economy.admin.grant.mutate({ userId, rox, note })`).
 *
 * The charge/metering write path is NOT a user-facing procedure — it is the
 * internal `settleRequest` service (`economy.service.ts`), called from the
 * agent/host completion path (WS-E P2 wiring).
 */

import { db } from "@rox/db/client";
import { roxBalances, roxLedger, usageRequests } from "@rox/db/schema";
import { applyGrant } from "@rox/shared/rox-ledger";
import { toLedgerKind } from "@rox/shared/rox-ledger-kind";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, protectedProcedure } from "../../trpc";
import { ensureBalance, STARTING_BALANCE_ROX } from "./economy.service";

/** Shared cursor-pagination input: a `createdAt` ISO cursor + page limit. */
const pageInput = z
	.object({
		limit: z.number().int().min(1).max(200).default(50),
		cursor: z.string().datetime().optional(),
	})
	.default({ limit: 50 });

export const economyRouter = {
	/** Current Rox balance, seeding the starting grant on first read. */
	balance: protectedProcedure.query(async ({ ctx }) => {
		const _balanceRox = await ensureBalance(ctx.session.user.id);
		const row = await db.query.roxBalances.findFirst({
			where: eq(roxBalances.userId, ctx.session.user.id),
			columns: { balanceRox: true, updatedAt: true },
		});
		return {
			balanceRox: row?.balanceRox ?? String(STARTING_BALANCE_ROX),
			updatedAt: row?.updatedAt ?? new Date(),
		};
	}),

	/** Paginated ledger history, newest first. */
	ledger: protectedProcedure.input(pageInput).query(async ({ ctx, input }) => {
		const userId = ctx.session.user.id;
		const where = input.cursor
			? and(
					eq(roxLedger.userId, userId),
					lt(roxLedger.createdAt, new Date(input.cursor)),
				)
			: eq(roxLedger.userId, userId);

		const rows = await db
			.select({
				id: roxLedger.id,
				deltaRox: roxLedger.deltaRox,
				kind: roxLedger.kind,
				usageRequestId: roxLedger.usageRequestId,
				topupId: roxLedger.topupId,
				createdAt: roxLedger.createdAt,
			})
			.from(roxLedger)
			.where(where)
			.orderBy(desc(roxLedger.createdAt))
			.limit(input.limit + 1);

		const hasMore = rows.length > input.limit;
		const items = hasMore ? rows.slice(0, input.limit) : rows;
		const nextCursor = hasMore
			? items[items.length - 1]?.createdAt.toISOString()
			: undefined;

		return { items, nextCursor };
	}),

	/** Paginated usage_requests for the user, scoped to the active org. */
	usage: protectedProcedure.input(pageInput).query(async ({ ctx, input }) => {
		const userId = ctx.session.user.id;
		const organizationId = ctx.activeOrganizationId;

		const base = organizationId
			? and(
					eq(usageRequests.userId, userId),
					eq(usageRequests.organizationId, organizationId),
				)
			: eq(usageRequests.userId, userId);
		const where = input.cursor
			? and(base, lt(usageRequests.createdAt, new Date(input.cursor)))
			: base;

		const rows = await db
			.select({
				id: usageRequests.id,
				organizationId: usageRequests.organizationId,
				chatSessionId: usageRequests.chatSessionId,
				modelId: usageRequests.modelId,
				tokensIn: usageRequests.tokensIn,
				tokensOut: usageRequests.tokensOut,
				usdCost: usageRequests.usdCost,
				roxCost: usageRequests.roxCost,
				trace: usageRequests.trace,
				createdAt: usageRequests.createdAt,
			})
			.from(usageRequests)
			.where(where)
			.orderBy(desc(usageRequests.createdAt))
			.limit(input.limit + 1);

		const hasMore = rows.length > input.limit;
		const items = hasMore ? rows.slice(0, input.limit) : rows;
		const nextCursor = hasMore
			? items[items.length - 1]?.createdAt.toISOString()
			: undefined;

		return { items, nextCursor };
	}),

	admin: {
		/**
		 * Admin-only bonus-Rox grant (T6). Credits `rox` to a user's balance and
		 * appends a `rox_ledger` row with the WS-O-confirmed grant kind
		 * (`adjustment` — no `bonus` enum value is added; D8/WS-O Q2). Gated by
		 * {@link adminProcedure} (`@rox.one` email).
		 */
		grant: adminProcedure
			.input(
				z.object({
					userId: z.string().min(1),
					rox: z.number().positive(),
					note: z.string().max(500).optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const current = await ensureBalance(input.userId);
				const { balanceAfter, entry } = applyGrant(
					current,
					input.rox,
					input.note,
				);

				const ledgerEntryId = await db.transaction(async (tx) => {
					await tx
						.update(roxBalances)
						.set({ balanceRox: String(balanceAfter) })
						.where(eq(roxBalances.userId, input.userId));

					const [inserted] = await tx
						.insert(roxLedger)
						.values({
							userId: input.userId,
							deltaRox: String(entry.delta),
							kind: toLedgerKind("grant"),
						})
						.returning({ id: roxLedger.id });

					if (!inserted) {
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "Failed to append grant ledger entry.",
						});
					}
					return inserted.id;
				});

				return { balanceAfter, ledgerEntryId };
			}),
	},
} satisfies TRPCRouterRecord;
