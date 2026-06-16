/**
 * Rox per-request charge decision (#34, slice 3).
 *
 * The tier-aware policy layer that sits between the pure pricing/ledger
 * primitives and the per-request debit hook. It answers one question — "may
 * this request run, and what (if anything) does it debit?" — by combining:
 *
 *   - `roxCostForRequest` (what the request costs, 0 for free models),
 *   - `applyRequestCharge` (the prepaid debit + affordability gate), and
 *   - the plan-tier perk matrix (`canSpendBelowZero`).
 *
 * Free / zero-cost requests always run and never debit (free by default).
 * Paid requests a balance covers are debited normally. When a paid request
 * exceeds the balance, the tier decides: free-plan users are hard-stopped
 * (`insufficient-balance`), subscribers run postpaid into a negative balance
 * that billing reconciles later. This module owns no persistence — it returns
 * the ledger entry for the caller to append.
 */

import { applyRequestCharge, type RoxLedgerEntry } from "./rox-ledger";
import {
	type PricingFields,
	type RequestUsage,
	roxCostForRequest,
} from "./rox-models";
import { ROX_PERKS, type RoxPlanTier } from "./rox-perks";
import { quantizeRox } from "./rox-pricing";

/** How a charge decision resolved, for the caller's logging/telemetry. */
export type RoxChargeOutcome =
	/** Free model or zero-cost request: ran without any debit. */
	| "no-charge"
	/** Paid request fully covered by the balance: debited. */
	| "charged"
	/** Subscriber ran a paid request below zero (postpaid): debited negative. */
	| "postpaid"
	/** Free-plan user could not cover a paid request: blocked, nothing debited. */
	| "insufficient-balance";

/** The result of deciding whether/how to charge one request. */
export interface RoxChargeDecision {
	/** Whether the request may proceed. */
	allowed: boolean;
	/** Why it was allowed or blocked. */
	reason: RoxChargeOutcome;
	/** The plan tier the decision was made for. */
	tier: RoxPlanTier;
	/** The request's Rox cost (0 for free models). */
	cost: number;
	/** Balance after the decision (unchanged when blocked or free). */
	balanceAfter: number;
	/** Ledger entry to persist, or null when nothing was debited. */
	entry: RoxLedgerEntry | null;
}

/**
 * Decide whether a request may run and what it debits, honoring the plan tier.
 *
 * Delegates the prepaid path to {@link applyRequestCharge}; only the postpaid
 * (subscriber-below-zero) case is handled here, since the ledger primitive's
 * affordability gate is intentionally tier-agnostic.
 */
export function decideRoxCharge(args: {
	balance: number;
	usage: RequestUsage;
	entry: PricingFields;
	tier: RoxPlanTier;
	ctx?: { modelId?: string; requestId?: string };
}): RoxChargeDecision {
	const { balance, usage, entry, tier, ctx } = args;
	const cost = roxCostForRequest(usage, entry);
	const base = applyRequestCharge(balance, cost, ctx);

	// Free / zero-cost request: always allowed, never debits.
	if (!base.charged && !base.insufficient) {
		return {
			allowed: true,
			reason: "no-charge",
			tier,
			cost: base.cost,
			balanceAfter: base.balanceAfter,
			entry: base.entry,
		};
	}

	// Paid request the balance covers: debited normally.
	if (base.charged) {
		return {
			allowed: true,
			reason: "charged",
			tier,
			cost: base.cost,
			balanceAfter: base.balanceAfter,
			entry: base.entry,
		};
	}

	// base.insufficient: a paid request the balance cannot cover. Subscribers
	// run postpaid (negative balance, reconciled at billing); free-plan users
	// are hard-stopped at zero.
	if (ROX_PERKS[tier].canSpendBelowZero) {
		const balanceAfter = quantizeRox(balance - base.cost);
		return {
			allowed: true,
			reason: "postpaid",
			tier,
			cost: base.cost,
			balanceAfter,
			entry: {
				delta: -base.cost,
				balanceAfter,
				reason: "request",
				modelId: ctx?.modelId,
				requestId: ctx?.requestId,
			},
		};
	}

	return {
		allowed: false,
		reason: "insufficient-balance",
		tier,
		cost: base.cost,
		balanceAfter: balance,
		entry: null,
	};
}
