import { db } from "@rox/db/client";
import { usageRequests } from "@rox/db/schema";
import { and, countDistinct, eq, gte, sql } from "drizzle-orm";

/**
 * Number of days included in the GitHub-contributions-style activity heatmap.
 * 53 weeks keeps a full year visible while leaving room for the leading partial
 * week, matching the GitHub layout.
 */
export const HEATMAP_DAYS = 371;

export type ProfileAggregateStats = {
	/** Distinct chat sessions that produced at least one metered request. */
	sessions: number;
	/** Total metered requests (one row per request in `usage_requests`). */
	requests: number;
	/** Total tokens (input + output) across all metered requests. */
	tokens: number;
	/** Total Rox spent across all metered requests (numeric, summed as string). */
	roxSpent: string;
	/** Distinct UTC days with at least one metered request (lifetime). */
	activeDays: number;
};

export type ProfileHeatmapPoint = {
	/** UTC day in YYYY-MM-DD form. */
	date: string;
	/** Number of metered requests on that day. */
	count: number;
};

export type ProfileHeatmap = {
	/** First day of the window (UTC, YYYY-MM-DD). */
	start: string;
	/** Last day of the window (UTC, YYYY-MM-DD) — always today. */
	end: string;
	/** Dense per-day series covering [start, end] inclusive. */
	days: ProfileHeatmapPoint[];
	/** Sum of counts within the window. */
	total: number;
};

function utcDayKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function addUtcDays(base: Date, days: number): Date {
	const next = new Date(base);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

/**
 * Lifetime aggregate stats for a user, sourced from the Rox economy
 * `usage_requests` table (the canonical metered-activity ledger).
 */
export async function getProfileAggregateStats(
	userId: string,
): Promise<ProfileAggregateStats> {
	const [row] = await db
		.select({
			sessions: countDistinct(usageRequests.chatSessionId),
			requests: sql<number>`count(*)::int`,
			tokens: sql<number>`coalesce(sum(${usageRequests.tokensIn} + ${usageRequests.tokensOut}), 0)::bigint`,
			roxSpent: sql<string>`coalesce(sum(${usageRequests.roxCost}), 0)::text`,
			activeDays: sql<number>`count(distinct date(${usageRequests.createdAt} at time zone 'UTC'))::int`,
		})
		.from(usageRequests)
		.where(eq(usageRequests.userId, userId));

	return {
		sessions: Number(row?.sessions ?? 0),
		requests: Number(row?.requests ?? 0),
		tokens: Number(row?.tokens ?? 0),
		roxSpent: row?.roxSpent ?? "0",
		activeDays: Number(row?.activeDays ?? 0),
	};
}

/**
 * GitHub-contributions-style per-day request counts for the trailing
 * {@link HEATMAP_DAYS} window. Returns a dense series (zero-filled) so the UI
 * can render a stable grid without gaps.
 */
export async function getProfileHeatmap(
	userId: string,
): Promise<ProfileHeatmap> {
	const today = new Date();
	const end = utcDayKey(today);
	const startDate = addUtcDays(today, -(HEATMAP_DAYS - 1));
	const start = utcDayKey(startDate);

	const dayExpr = sql<string>`to_char(date(${usageRequests.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;

	const rows = await db
		.select({
			date: dayExpr,
			count: sql<number>`count(*)::int`,
		})
		.from(usageRequests)
		.where(
			and(
				eq(usageRequests.userId, userId),
				gte(sql`date(${usageRequests.createdAt} at time zone 'UTC')`, start),
			),
		)
		.groupBy(dayExpr);

	const byDay = new Map<string, number>();
	for (const row of rows) {
		byDay.set(row.date, Number(row.count));
	}

	const days: ProfileHeatmapPoint[] = [];
	let total = 0;
	for (let offset = 0; offset < HEATMAP_DAYS; offset += 1) {
		const key = utcDayKey(addUtcDays(startDate, offset));
		const count = byDay.get(key) ?? 0;
		total += count;
		days.push({ date: key, count });
	}

	return { start, end, days, total };
}
