/**
 * Drive quota core — pure, DB-free accounting math (D8 §2.4, DQ2).
 *
 * The soft-meter policy (DECISIONS.md DQ2): every user gets a single shared
 * 10 GiB quota across Drive + chat + email attachments. Going over the cap is
 * NOT a hard block — uploads beyond the cap are allowed when the user has opted
 * into overage (`overageOptIn`) and the bytes past the cap accrue to the WS-E
 * token economy (`rox_ledger` kind `drive_overage`). Existing files always stay
 * readable. This module owns no persistence; the DB-backed quota engine in
 * `@rox/trpc` calls these helpers and persists the result atomically.
 *
 * Kept here (in `@rox/shared`) so both the API write path and any client-side
 * pre-flight estimate share one source of truth and it unit-tests with no DB.
 */

import { quantizeRox, usdToRox } from "./rox-pricing";

/** 10 GiB free quota per user (DQ2). 10 * 1024^3 = 10737418240 bytes. */
export const DRIVE_FREE_QUOTA_BYTES = 10_737_418_240;

/** Bytes in one gigabyte (GB, decimal) — the unit overage is billed in. */
export const BYTES_PER_GB = 1_000_000_000;

/**
 * Default overage rate in Rox per GB-month. A config constant (D8 §2.4); the
 * call site may override it from env (`DRIVE_OVERAGE_ROX_PER_GB_MONTH`). Chosen
 * so 1 GB-month ≈ the Rox value of R2's ~$0.015/GB-mo with headroom, expressed
 * in the existing economy unit (`ROX_PER_USDT = 100`): 0.015 USD * 100 = 1.5.
 */
export const DEFAULT_DRIVE_OVERAGE_ROX_PER_GB_MONTH = quantizeRox(
	usdToRox(0.015),
);

/** Why an upload was allowed or refused. */
export type UploadDecisionReason =
	| "within_quota"
	| "overage_accrued"
	| "over_quota_blocked";

/** Outcome of a pre-flight / commit-time quota evaluation for one upload. */
export interface UploadDecision {
	/** Whether the upload is permitted to proceed. */
	allowed: boolean;
	/** Machine-readable reason for UI + auditing. */
	reason: UploadDecisionReason;
	/** `bytesUsed` after the upload commits (unchanged when blocked). */
	projectedBytesUsed: number;
	/**
	 * Bytes of THIS upload that land beyond the quota cap (0 when fully within).
	 * Used by the daily overage job to meter cost; not billed inline.
	 */
	overageBytes: number;
}

/** Current accounting state needed to decide an upload. */
export interface QuotaState {
	/** Bytes currently counted against the user. */
	bytesUsed: number;
	/** The user's quota cap in bytes (defaults to {@link DRIVE_FREE_QUOTA_BYTES}). */
	quotaBytes: number;
	/** Whether the user has opted into billed overage past the cap (DQ2). */
	overageOptIn: boolean;
}

function nonNegative(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Decide whether an upload of `sizeBytes` may proceed for a user in
 * `state` (DQ2 soft-meter):
 *
 *  - Fully within the cap → allowed (`within_quota`).
 *  - Would exceed the cap AND `overageOptIn` → allowed (`overage_accrued`); the
 *    portion past the cap is reported as `overageBytes`.
 *  - Would exceed the cap AND NOT opted in → blocked (`over_quota_blocked`).
 *    Existing files are unaffected; only the NEW upload is refused.
 *
 * A zero/negative `sizeBytes` is treated as a no-op upload that is always
 * within quota (defensive: never let a malformed size flip the decision).
 */
export function computeUploadDecision(
	state: QuotaState,
	sizeBytes: number,
): UploadDecision {
	const size = nonNegative(sizeBytes);
	const used = nonNegative(state.bytesUsed);
	const cap =
		Number.isFinite(state.quotaBytes) && state.quotaBytes >= 0
			? state.quotaBytes
			: DRIVE_FREE_QUOTA_BYTES;

	const projected = used + size;

	if (projected <= cap) {
		return {
			allowed: true,
			reason: "within_quota",
			projectedBytesUsed: projected,
			overageBytes: 0,
		};
	}

	// The part of THIS upload that lands past the cap. If the user was already
	// over the cap, the whole upload is overage; otherwise only the slice above.
	const overageBytes = projected - Math.max(used, cap);

	if (!state.overageOptIn) {
		return {
			allowed: false,
			reason: "over_quota_blocked",
			projectedBytesUsed: used, // unchanged: nothing committed
			overageBytes: 0,
		};
	}

	return {
		allowed: true,
		reason: "overage_accrued",
		projectedBytesUsed: projected,
		overageBytes,
	};
}

/**
 * Over-quota bytes for a user right now (0 when at/under the cap). The daily
 * overage job meters on this snapshot, not on per-upload deltas, so it is
 * self-correcting against drift.
 */
export function overQuotaBytes(state: {
	bytesUsed: number;
	quotaBytes: number;
}): number {
	const used = nonNegative(state.bytesUsed);
	const cap =
		Number.isFinite(state.quotaBytes) && state.quotaBytes >= 0
			? state.quotaBytes
			: DRIVE_FREE_QUOTA_BYTES;
	return Math.max(0, used - cap);
}

/**
 * Convert an over-quota byte snapshot into the Rox debit for ONE day, prorated
 * from a monthly GB rate. `daysInMonth` (default 30) prorates the GB-month rate
 * to a single day so the daily cron accrues ~1/30th of a month each run.
 *
 * Returns a non-negative, ledger-precision Rox amount (the magnitude to debit;
 * the ledger row stores it as a negative delta).
 */
export function dailyOverageRox(
	overBytes: number,
	roxPerGbMonth: number = DEFAULT_DRIVE_OVERAGE_ROX_PER_GB_MONTH,
	daysInMonth = 30,
): number {
	const over = nonNegative(overBytes);
	const rate = nonNegative(roxPerGbMonth);
	const days = daysInMonth > 0 ? daysInMonth : 30;
	if (over === 0 || rate === 0) return 0;
	const gb = over / BYTES_PER_GB;
	const monthly = gb * rate;
	return quantizeRox(monthly / days);
}

/**
 * Atomic-decrement guard: bytes to subtract from `bytesUsed` on hard-delete,
 * clamped so the counter can never go negative (mirrors the DB CHECK
 * `bytes_used >= 0`).
 */
export function clampDecrement(bytesUsed: number, sizeBytes: number): number {
	const used = nonNegative(bytesUsed);
	const size = nonNegative(sizeBytes);
	return Math.min(size, used);
}
