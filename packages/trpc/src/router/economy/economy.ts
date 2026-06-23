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
import {
	modelCatalog,
	roxBalances,
	roxLedger,
	roxTopups,
	usageRequests,
} from "@rox/db/schema";
import {
	buildInvoiceRequest,
	createDvNetClient,
} from "@rox/shared/dvnet-client";
import { applyGrant } from "@rox/shared/rox-ledger";
import { toLedgerKind } from "@rox/shared/rox-ledger-kind";
import { quoteTopUp } from "@rox/shared/rox-topup";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import {
	adminProcedure,
	protectedProcedure,
	publicProcedure,
} from "../../trpc";
import { ensureBalance, STARTING_BALANCE_ROX } from "./economy.service";

/**
 * Resolve the public API origin the dv.net webhook should call back. dv.net
 * POSTs the confirmed payment to `${origin}/api/economy/dvnet/webhook`; the
 * route reconciles `order_id` → the pending `rox_topups` row. The origin is the
 * API app's own base URL (where the route lives), read at call time so the
 * router module imports without an env dependency (tests never hit this).
 */
function resolveTopupCallbackUrl(): string {
	const origin =
		process.env.NEXT_PUBLIC_API_URL ??
		process.env.NEXT_PUBLIC_WEB_URL ??
		"https://app.rox.one";
	return `${origin.replace(/\/$/, "")}/api/economy/dvnet/webhook`;
}

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

	topup: {
		/**
		 * Preview the Rox a USDT amount buys (T4). Pure — no DB, no provider call.
		 * Rejects a non-positive amount so the UI never shows a 0/negative quote.
		 */
		quote: protectedProcedure
			.input(z.object({ usdtAmount: z.number().positive() }))
			.query(({ input }) => quoteTopUp(input.usdtAmount)),

		/**
		 * Create a dv.net top-up invoice (T4): insert a `pending` `rox_topups`
		 * row, ask dv.net for a hosted checkout, reconcile the provider invoice id
		 * back onto the row, and return the checkout URL for the client to open.
		 *
		 * The dv.net API key is read ONLY inside the client (`createDvNetClient`);
		 * this procedure never sees it. On a provider failure the pending row is
		 * left in place (status `pending`) so the reconciliation poll (P2) can
		 * still settle it if the charge actually went through.
		 */
		createInvoice: protectedProcedure
			.input(z.object({ usdtAmount: z.number().positive() }))
			.mutation(async ({ ctx, input }) => {
				const userId = ctx.session.user.id;
				const quote = quoteTopUp(input.usdtAmount);

				// Insert the pending row first so we have a stable order_id (our row
				// id) to hand dv.net and to reconcile the webhook against. The
				// dvnetInvoiceId is filled in once the provider returns it.
				const [topup] = await db
					.insert(roxTopups)
					.values({
						userId,
						usdtAmount: String(quote.usdt),
						roxAmount: String(quote.rox),
						dvnetInvoiceId: "",
						status: "pending",
					})
					.returning({ id: roxTopups.id });

				if (!topup) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create top-up invoice row.",
					});
				}

				const request = buildInvoiceRequest(
					quote.usdt,
					topup.id,
					resolveTopupCallbackUrl(),
				);

				let invoice: { invoiceId: string; checkoutUrl: string };
				try {
					invoice = await createDvNetClient().createInvoice(request);
				} catch (error) {
					console.error("[economy/topup] dv.net createInvoice failed:", error);
					throw new TRPCError({
						code: "BAD_GATEWAY",
						message: "Payment provider could not create the invoice.",
					});
				}

				await db
					.update(roxTopups)
					.set({ dvnetInvoiceId: invoice.invoiceId })
					.where(eq(roxTopups.id, topup.id));

				return {
					topupId: topup.id,
					checkoutUrl: invoice.checkoutUrl,
					usdt: quote.usdt,
					rox: quote.rox,
				};
			}),
	},

	models: {
		/**
		 * Read the model catalog for the agents cabinet / model picker (T7).
		 * Public — the catalog is non-sensitive pricing/capability metadata. The
		 * catalog is populated by the offline sync job (`sync-model-catalog.ts`);
		 * an empty result means the sync has not run yet.
		 */
		list: publicProcedure.query(async () => {
			return db
				.select({
					id: modelCatalog.id,
					provider: modelCatalog.provider,
					modelId: modelCatalog.modelId,
					publicUsdPerMIn: modelCatalog.publicUsdPerMIn,
					publicUsdPerMOut: modelCatalog.publicUsdPerMOut,
					pricingFamily: modelCatalog.pricingFamily,
					isFree: modelCatalog.isFree,
					params: modelCatalog.params,
					specs: modelCatalog.specs,
					tools: modelCatalog.tools,
					limits: modelCatalog.limits,
				})
				.from(modelCatalog)
				.orderBy(asc(modelCatalog.provider), asc(modelCatalog.modelId));
		}),
	},

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
