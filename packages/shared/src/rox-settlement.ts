/**
 * Rox request settlement plan (#34, slice 4).
 *
 * Maps a per-request charge decision onto the exact persistence side-effects a
 * completed request implies, as plain data — without performing any I/O. The
 * eventual request-completion transaction consumes this to write three rows:
 *
 *   - `usage_requests` — recorded for EVERY metered request (even free or
 *     blocked ones) so usage analytics are complete;
 *   - `rox_ledger`     — a signed delta, appended ONLY when a debit happened;
 *   - `rox_balances`   — the new balance, written ONLY when a debit happened.
 *
 * Keeping the "what to persist" rule pure (and tested) means the DB transaction
 * stays a thin, mechanical writer. The ledger row's generated `usageRequestId`
 * is filled in by the transaction after the usage row is inserted, so it is not
 * part of this plan.
 */

import { decideRoxCharge, type RoxChargeDecision } from "./rox-charge";
import type { PricingFields, RequestUsage } from "./rox-models";
import type { RoxPlanTier } from "./rox-perks";

/** The persistence side-effects a completed request implies, as plain data. */
export interface RequestSettlementPlan {
	/** The allow/charge decision (allowed, reason, tier, cost, balanceAfter, entry). */
	decision: RoxChargeDecision;
	/** `usage_requests` row fields. Recorded for every metered request. */
	usage: {
		modelId: string;
		tokensIn: number;
		tokensOut: number;
		/** The request's Rox cost (0 for free models). */
		roxCost: number;
	};
	/** `rox_ledger` delta to append (signed Rox), or null when nothing was debited. */
	ledgerDeltaRox: number | null;
	/** New `rox_balances` value to persist, or null when the balance is unchanged. */
	newBalanceRox: number | null;
}

/**
 * Plan the persistence for one completed request. Delegates the allow/charge
 * verdict to {@link decideRoxCharge}, then shapes the usage/ledger/balance rows
 * from it. A debit moves the ledger and balance exactly when the decision
 * produced a ledger entry (charged or postpaid); free and blocked requests
 * still record usage but move neither.
 */
export function planRequestSettlement(args: {
	balance: number;
	usage: RequestUsage;
	entry: PricingFields;
	tier: RoxPlanTier;
	modelId: string;
	requestId?: string;
}): RequestSettlementPlan {
	const { balance, usage, entry, tier, modelId, requestId } = args;
	const decision = decideRoxCharge({
		balance,
		usage,
		entry,
		tier,
		ctx: { modelId, requestId },
	});

	return {
		decision,
		usage: {
			modelId,
			// A non-finite token count (NaN/±Infinity from a malformed provider
			// payload) collapses to 0 — never write NaN into a numeric column.
			tokensIn: Number.isFinite(usage.inputTokens)
				? Math.max(0, usage.inputTokens)
				: 0,
			tokensOut: Number.isFinite(usage.outputTokens)
				? Math.max(0, usage.outputTokens)
				: 0,
			roxCost: decision.cost,
		},
		// Only a real debit (charged/postpaid → entry present) moves money.
		ledgerDeltaRox: decision.entry ? decision.entry.delta : null,
		newBalanceRox: decision.entry ? decision.balanceAfter : null,
	};
}
