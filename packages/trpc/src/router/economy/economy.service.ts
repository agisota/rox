/**
 * Economy server service (WS-E T2 + T9) — Drizzle-backed wrappers.
 *
 * Responsibilities:
 *  - {@link ensureBalance} — read-or-seed a user's `rox_balances` row (lifts the
 *    seeding logic from `user.ts:54-71`). The 500-Rox seed is the column default
 *    (`economy.ts:193`), so an insert-on-conflict-do-nothing is enough.
 *  - {@link settleRequest} — run the pure {@link settleRequestWith} core against
 *    a model's pricing and persist the three rows (usage / ledger / balance) in
 *    ONE transaction, per WS-E §2.1. This is the single write path both web and
 *    desktop agents settle through (multiplatform-first).
 *
 * The pure, DB-free settle core lives in `settle-core.ts` so it stays
 * unit-testable without a live DB env.
 */

import { db } from "@rox/db/client";
import type { RoxLedgerKind } from "@rox/db/enums";
import { roxBalances, roxLedger, usageRequests } from "@rox/db/schema";
import type { RoxLedgerKind as SharedRoxLedgerKind } from "@rox/shared/rox-ledger-kind";
import { eq } from "drizzle-orm";

import {
	type EconomySettlePort,
	type EconomySettleTx,
	type SettleRequestArgs,
	type SettleRequestResult,
	settleRequestWith,
} from "./settle-core";

/**
 * Compile-time guard that the locally-mirrored ledger-kind union in
 * `@rox/shared/rox-ledger-kind` stays identical to the real `@rox/db/enums`
 * type. If the db enum drifts, this assignment fails typecheck and CI catches
 * it — exactly the drift protection §1.3.6 asks for.
 */
type _AssertSharedMatchesDb = SharedRoxLedgerKind extends RoxLedgerKind
	? RoxLedgerKind extends SharedRoxLedgerKind
		? true
		: never
	: never;
const _ledgerKindParity: _AssertSharedMatchesDb = true;
void _ledgerKindParity;

export {
	type SettleRequestArgs,
	type SettleRequestResult,
	settleRequestWith,
} from "./settle-core";

/** The starting balance seeded on a user's first balance read (matches the
 * `rox_balances.balance_rox` column default of 500). */
export const STARTING_BALANCE_ROX = 500;

/**
 * Ensure a `rox_balances` row exists for the user and return the current
 * balance as a number. Seeds {@link STARTING_BALANCE_ROX} via the column
 * default on first read.
 */
export async function ensureBalance(userId: string): Promise<number> {
	await db
		.insert(roxBalances)
		.values({ userId })
		.onConflictDoNothing({ target: roxBalances.userId });

	const row = await db.query.roxBalances.findFirst({
		where: eq(roxBalances.userId, userId),
		columns: { balanceRox: true },
	});

	return row ? Number(row.balanceRox) : STARTING_BALANCE_ROX;
}

/**
 * Production settlement: builds the Drizzle-backed {@link EconomySettlePort} and
 * runs {@link settleRequestWith}. The metering call site (host/agent completion)
 * invokes this (WS-E P2 wiring).
 *
 * NOTE: `loadPricing` currently treats every model as the free house model
 * (zero-cost) until the `model_catalog` sync (T7) populates real prices; this
 * keeps the write path correct (usage recorded, never an unbounded debit)
 * before the catalog exists.
 */
export async function settleRequest(
	args: SettleRequestArgs,
): Promise<SettleRequestResult> {
	const port: EconomySettlePort = {
		async loadPricing() {
			// T7 will read `model_catalog`; until then every request is free.
			return {
				publicUsdPerMIn: 0,
				publicUsdPerMOut: 0,
				pricingFamily: "other",
				isFree: true,
			};
		},
		async runInTransaction(fn) {
			return db.transaction(async (dbTx) => {
				const tx: EconomySettleTx = {
					async ensureBalance(userId) {
						await dbTx
							.insert(roxBalances)
							.values({ userId })
							.onConflictDoNothing({ target: roxBalances.userId });
						const row = await dbTx.query.roxBalances.findFirst({
							where: eq(roxBalances.userId, userId),
							columns: { balanceRox: true },
						});
						return row ? Number(row.balanceRox) : STARTING_BALANCE_ROX;
					},
					async insertUsage(row) {
						const [inserted] = await dbTx
							.insert(usageRequests)
							.values({
								userId: row.userId,
								organizationId: row.organizationId,
								chatSessionId: row.chatSessionId,
								modelId: row.modelId,
								tokensIn: row.tokensIn,
								tokensOut: row.tokensOut,
								roxCost: row.roxCost,
								trace: row.trace,
							})
							.returning({ id: usageRequests.id });
						return inserted?.id ?? "";
					},
					async insertLedger(row) {
						const [inserted] = await dbTx
							.insert(roxLedger)
							.values({
								userId: row.userId,
								deltaRox: row.deltaRox,
								kind: row.kind,
								usageRequestId: row.usageRequestId,
							})
							.returning({ id: roxLedger.id });
						return inserted?.id ?? "";
					},
					async updateBalance(newBalanceRox) {
						await dbTx
							.update(roxBalances)
							.set({ balanceRox: newBalanceRox })
							.where(eq(roxBalances.userId, args.userId));
					},
				};
				return fn(tx);
			});
		},
	};

	return settleRequestWith(port, args);
}
