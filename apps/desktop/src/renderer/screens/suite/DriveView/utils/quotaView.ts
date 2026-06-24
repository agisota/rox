/**
 * Pure presentation math for the Drive quota meter (used / cap). Ported from
 * `apps/web/.../QuotaBar/quotaView.ts`. Kept separate from the component so the
 * percentage + warning thresholds are unit-testable without a DOM.
 *
 * Mirrors the server's soft-meter model: going over the cap is possible with
 * overage opt-in, so the percentage is clamped to 100 for the bar but the raw
 * `overBytes` is surfaced for an over-quota notice.
 */

export interface QuotaSnapshot {
	bytesUsed: number;
	quotaBytes: number;
	overageOptIn: boolean;
}

export interface QuotaView {
	percent: number;
	overBytes: number;
	isOver: boolean;
	/** Visual severity for the bar color. */
	tone: "normal" | "warning" | "over";
}

export function quotaView(snapshot: QuotaSnapshot): QuotaView {
	const cap = Math.max(0, snapshot.quotaBytes);
	const used = Math.max(0, snapshot.bytesUsed);
	const ratio = cap === 0 ? 1 : used / cap;
	const percent = Math.min(100, Math.round(ratio * 100));
	const overBytes = Math.max(0, used - cap);
	const isOver = overBytes > 0;
	const tone: QuotaView["tone"] = isOver
		? "over"
		: ratio >= 0.9
			? "warning"
			: "normal";
	return { percent, overBytes, isOver, tone };
}
