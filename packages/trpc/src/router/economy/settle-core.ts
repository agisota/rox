/**
 * Pure request-settlement core (WS-E T2 + T9), DB-free.
 *
 * Holds the "what to persist for a completed request" logic as a port-driven,
 * unit-testable function. The production Drizzle-backed port lives in
 * `economy.service.ts`; tests inject an in-memory port. Keeping this file free
 * of `@rox/db/client` means the settle logic is testable without a live DB env.
 *
 * T9 (tier decouple): the charge path hardcodes `tier: "free"` (prepaid
 * hard-stop at 0). NO subscription read — subscriptions are removed (#70); a
 * paying user tops up Rox instead of carrying a postpaid tier.
 */

import { toLedgerKind } from "@rox/shared/rox-ledger-kind";
import type { PricingFields, RequestUsage } from "@rox/shared/rox-models";
import { planRequestSettlement } from "@rox/shared/rox-settlement";

/**
 * The plan tier the live charge path runs under. T9: every user is prepaid
 * (`free` = hard-stop at 0, top up to continue).
 * TODO(#70): remove the postpaid/`subscriber` path entirely once Stripe is gone.
 */
export const LIVE_CHARGE_TIER = "free" as const;

/** The persisted `rox_ledger.kind` enum union (mirrors `@rox/db/enums`). */
export type LedgerKind = ReturnType<typeof toLedgerKind>;

/** Arguments describing a completed metered request to settle. */
export interface SettleRequestArgs {
	userId: string;
	organizationId: string | null;
	chatSessionId: string | null;
	modelId: string;
	usage: RequestUsage;
	/** Optional opaque trace blob persisted on the usage row. */
	trace?: Record<string, unknown>;
}

/** Outcome of a settlement, summarised for the caller. */
export interface SettleRequestResult {
	/** Whether the request was allowed to proceed (false = blocked, no debit). */
	allowed: boolean;
	/** Whether a real debit (ledger + balance write) happened. */
	charged: boolean;
	/** The request's Rox cost (0 for free models / blocked requests). */
	roxCost: number;
	/** The new balance after settlement (unchanged when nothing was debited). */
	balanceRox: number;
}

/** The single transaction's row writers, as seen by the pure settle core. */
export interface EconomySettleTx {
	/** Read-or-seed the balance inside the transaction; returns current Rox. */
	ensureBalance(userId: string): Promise<number>;
	/** Insert the always-written usage row; returns its generated id. */
	insertUsage(row: {
		userId: string;
		organizationId: string | null;
		chatSessionId: string | null;
		modelId: string;
		tokensIn: number;
		tokensOut: number;
		roxCost: string;
		trace?: Record<string, unknown>;
	}): Promise<string>;
	/** Insert a ledger row (only on a real debit); returns its generated id. */
	insertLedger(row: {
		userId: string;
		deltaRox: string;
		kind: LedgerKind;
		usageRequestId: string | null;
	}): Promise<string>;
	/** Persist the new balance (only on a real debit). */
	updateBalance(newBalanceRox: string): Promise<void>;
}

/** The persistence boundary the pure settle core depends on. */
export interface EconomySettlePort {
	/** Resolve the model's pricing fields (catalog row or the free house model). */
	loadPricing(modelId: string): Promise<PricingFields>;
	/** Run the three writes atomically. */
	runInTransaction<T>(fn: (tx: EconomySettleTx) => Promise<T>): Promise<T>;
}

/**
 * Pure settlement core: plan + persist via the injected {@link EconomySettlePort}.
 * Always inserts a usage row; appends a ledger row and updates the balance ONLY
 * when the plan produced a debit (`ledgerDeltaRox`/`newBalanceRox` non-null),
 * back-filling the generated `usageRequestId` into the ledger row.
 */
export async function settleRequestWith(
	port: EconomySettlePort,
	args: SettleRequestArgs,
): Promise<SettleRequestResult> {
	const pricing = await port.loadPricing(args.modelId);

	return port.runInTransaction(async (tx) => {
		const balance = await tx.ensureBalance(args.userId);

		const plan = planRequestSettlement({
			balance,
			usage: args.usage,
			entry: pricing,
			tier: LIVE_CHARGE_TIER,
			modelId: args.modelId,
		});

		const usageRequestId = await tx.insertUsage({
			userId: args.userId,
			organizationId: args.organizationId,
			chatSessionId: args.chatSessionId,
			modelId: plan.usage.modelId,
			tokensIn: plan.usage.tokensIn,
			tokensOut: plan.usage.tokensOut,
			roxCost: String(plan.usage.roxCost),
			trace: args.trace,
		});

		let charged = false;
		if (plan.ledgerDeltaRox !== null && plan.newBalanceRox !== null) {
			await tx.insertLedger({
				userId: args.userId,
				deltaRox: String(plan.ledgerDeltaRox),
				kind: toLedgerKind("request"),
				usageRequestId,
			});
			await tx.updateBalance(String(plan.newBalanceRox));
			charged = true;
		}

		return {
			allowed: plan.decision.allowed,
			charged,
			roxCost: plan.usage.roxCost,
			balanceRox: plan.newBalanceRox ?? balance,
		};
	});
}
