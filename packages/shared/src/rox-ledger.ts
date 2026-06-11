/**
 * Rox balance ledger core (#34, slice 2).
 *
 * Pure balance arithmetic + ledger-entry shaping that sits on top of the
 * pricing primitives (`roxCostForRequest`, `usdToRox`). Everything is free by
 * default: a zero-cost / free-model request never debits, so a user with an
 * empty balance can always run the free `rox r1` model.
 *
 * This module owns no persistence. The Drizzle `rox_ledger` / balance tables,
 * the dv.net top-up flow, and the usage dashboards are separate slices that
 * append the entries this module produces.
 */

import type { RoxRequestCost } from "./rox-models";
import { quantizeRox, usdToRox } from "./rox-pricing";

export type RoxLedgerReason = "topup" | "request" | "grant" | "adjustment";

/**
 * A single balance movement. `delta` is signed Rox (+credit / -debit) and
 * `balanceAfter` is the resulting balance, so the ledger is self-auditing.
 */
export interface RoxLedgerEntry {
	delta: number;
	balanceAfter: number;
	reason: RoxLedgerReason;
	modelId?: string;
	requestId?: string;
	note?: string;
}

/** Outcome of attempting to charge a request against a balance. */
export interface RoxChargeResult {
	/** Whether any Rox was actually debited (false for free/zero-cost). */
	charged: boolean;
	/** The request's Rox cost (0 for free models). */
	cost: number;
	/** Balance after the charge (unchanged when not charged). */
	balanceAfter: number;
	/** The ledger entry to persist, or null when nothing was debited. */
	entry: RoxLedgerEntry | null;
	/** True when the model was paid but the balance could not cover it. */
	insufficient: boolean;
}

/** True when `balance` can cover `cost`. */
export function canAfford(balance: number, cost: number): boolean {
	return balance >= cost;
}

/**
 * Clamp an incoming amount to a non-negative, finite, ledger-precision value.
 * A non-finite amount (NaN/±Infinity from a malformed provider payload or
 * catalog) collapses to 0 — never credit or debit an unbounded amount.
 */
function safeAmount(amount: number): number {
	return quantizeRox(Math.max(0, amount));
}

/** Credit a balance from a USDT top-up (1 USDT = ROX_PER_USDT Rox). */
export function applyTopUp(
	balance: number,
	usdtAmount: number,
	note?: string,
): { balanceAfter: number; entry: RoxLedgerEntry } {
	const delta = safeAmount(usdToRox(Math.max(0, usdtAmount)));
	const balanceAfter = quantizeRox(balance + delta);
	return {
		balanceAfter,
		entry: { delta, balanceAfter, reason: "topup", note },
	};
}

/** Credit a balance with a promotional/grant amount (already in Rox). */
export function applyGrant(
	balance: number,
	rox: number,
	note?: string,
): { balanceAfter: number; entry: RoxLedgerEntry } {
	const delta = safeAmount(rox);
	const balanceAfter = quantizeRox(balance + delta);
	return {
		balanceAfter,
		entry: { delta, balanceAfter, reason: "grant", note },
	};
}

/**
 * Apply a per-request charge to a balance.
 *
 * Free / zero-cost requests never debit (free by default) — they return
 * `charged: false` with the balance untouched and no entry. A paid request the
 * balance cannot cover is reported via `insufficient: true` (not thrown): the
 * caller decides whether to block or fall back to the free `rox r1` model.
 */
export function applyRequestCharge(
	balance: number,
	rawCost: RoxRequestCost,
	ctx?: { modelId?: string; requestId?: string },
): RoxChargeResult {
	// A non-finite or non-positive cost is treated as free (never debit an
	// unbounded amount); quantize so the debit matches the persisted precision.
	const cost = quantizeRox(rawCost.totalRox);
	if (rawCost.isFree || !(cost > 0)) {
		return {
			charged: false,
			cost: 0,
			balanceAfter: balance,
			entry: null,
			insufficient: false,
		};
	}
	if (!canAfford(balance, cost)) {
		return {
			charged: false,
			cost,
			balanceAfter: balance,
			entry: null,
			insufficient: true,
		};
	}
	const balanceAfter = quantizeRox(balance - cost);
	return {
		charged: true,
		cost,
		balanceAfter,
		entry: {
			delta: -cost,
			balanceAfter,
			reason: "request",
			modelId: ctx?.modelId,
			requestId: ctx?.requestId,
		},
		insufficient: false,
	};
}
