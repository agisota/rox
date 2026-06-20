/**
 * Real revenue trend (WS-F T9) — replaces the zero-stub in
 * `analytics.getRevenueTrend`.
 *
 * Source of truth = confirmed `rox_topups` (the prepaid USDT→Rox invoices,
 * `packages/db/src/schema/economy.ts`). Revenue for a day = the sum of
 * `usdt_amount` over topups whose `status='confirmed'` and whose `confirmed_at`
 * falls on that day (UTC). Pending/failed/expired topups are excluded.
 *
 * Per the MASTER-PLAN merge-safety contract this helper is **WS-F-owned** so the
 * only edit WS-F makes to the shared `analytics.ts` is a single import + call
 * swap (no body churn, minimal merge surface with WS-E/WS-O).
 *
 * MRR is intentionally `null`: under the prepaid Rox economy there are no
 * recurring subscriptions, so a monthly-recurring-revenue figure is undefined.
 * The field is kept on the row for shape-compatibility with the chart component.
 */

import { db } from "@rox/db/client";
import { roxTopups } from "@rox/db/schema";
import { and, eq, gte } from "drizzle-orm";

export type RevenueTrendPoint = {
	date: string;
	revenue: number;
	mrr: number | null;
};

/** A confirmed topup reduced to the two fields the trend needs. */
export type ConfirmedTopup = {
	usdtAmount: string | number;
	confirmedAt: Date | string | null;
};

/** UTC `YYYY-MM-DD` for a date-ish value. */
function toUtcDay(value: Date | string): string {
	const d = value instanceof Date ? value : new Date(value);
	return d.toISOString().slice(0, 10);
}

/**
 * Pure aggregation: bucket confirmed topups by their `confirmedAt` UTC day and
 * produce a contiguous, date-filled array spanning the last `days` days
 * (inclusive of today), oldest first — matching the legacy stub's shape so the
 * chart needs no changes. `now` is injectable for deterministic tests.
 */
export function buildRevenueTrend(
	topups: ConfirmedTopup[],
	days: number,
	now: Date = new Date(),
): RevenueTrendPoint[] {
	const byDay = new Map<string, number>();
	for (const t of topups) {
		if (!t.confirmedAt) continue;
		const day = toUtcDay(t.confirmedAt);
		const amount = Number(t.usdtAmount) || 0;
		byDay.set(day, (byDay.get(day) ?? 0) + amount);
	}

	const filled: RevenueTrendPoint[] = [];
	for (let i = days - 1; i >= 0; i--) {
		const date = new Date(now);
		date.setUTCDate(date.getUTCDate() - i);
		const dateStr = date.toISOString().slice(0, 10);
		filled.push({
			date: dateStr,
			revenue: byDay.get(dateStr) ?? 0,
			// Prepaid economy: no recurring revenue → MRR is undefined.
			mrr: null,
		});
	}
	return filled;
}

/**
 * Query confirmed topups within the window, then aggregate. Reads only
 * `rox_topups` (WS-E-owned schema, read-only here). The window start is the
 * UTC midnight `days-1` days before today so the earliest filled bucket is
 * covered.
 */
export async function getRevenueTrend(
	days: number,
): Promise<RevenueTrendPoint[]> {
	const now = new Date();
	const windowStart = new Date(now);
	windowStart.setUTCDate(windowStart.getUTCDate() - (days - 1));
	windowStart.setUTCHours(0, 0, 0, 0);

	const rows = await db
		.select({
			usdtAmount: roxTopups.usdtAmount,
			confirmedAt: roxTopups.confirmedAt,
		})
		.from(roxTopups)
		.where(
			and(
				eq(roxTopups.status, "confirmed"),
				gte(roxTopups.confirmedAt, windowStart),
			),
		);

	return buildRevenueTrend(rows, days, now);
}
