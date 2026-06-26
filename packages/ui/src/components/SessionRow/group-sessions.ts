/**
 * Pure, framework-agnostic time-grouping for the chat history list
 * (Hermes-borrow F18). No DOM, no React, no `Date.now()` — the caller injects a
 * server-synced `now`, so desktop/web/mobile bucket an identical session list
 * into byte-identical groups. This is the "one core" act: the *grouping* lives
 * here once and every surface renders the same buckets.
 *
 * The function returns stable, enum-like group **keys** (never display strings)
 * plus an `olderAt` timestamp for the catch-all bucket, so each surface resolves
 * its own localized label (and the desktop keeps its `getRelativeTime` rendering
 * for the "older" bucket). Pinning (F19) stays in `selectPinnedSessions`; this
 * module only buckets whatever it's handed by activity recency.
 */

/** Stable, surface-resolved group keys. `★Pinned` is owned by F19 upstream. */
export type SessionAgeGroupKey =
	| "today"
	| "yesterday"
	| "last7Days"
	| "last30Days"
	| "older";

/** The minimum a session needs to be time-grouped. */
export interface AgeGroupableSession {
	/** Last-active time; drives which bucket the session lands in. */
	updatedAt: Date;
}

/** One time bucket: a stable `key` plus its members in input order. */
export interface SessionAgeGroup<T extends AgeGroupableSession> {
	key: SessionAgeGroupKey;
	/**
	 * For the `older` bucket, the bucket's reference timestamp (the first
	 * session's `updatedAt`) so a surface can render a relative label like
	 * "2 months ago"; `null` for the fixed buckets (today/yesterday/…).
	 */
	olderAt: number | null;
	sessions: T[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Midnight (local) of the day containing `now`. */
function startOfDay(now: Date): Date {
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	return start;
}

/**
 * Bucket a single `updatedAt` relative to a server-synced `now`. Boundaries
 * match the long-standing desktop behaviour: today / yesterday / last 7 days /
 * last 30 days, then everything else falls to `older`.
 */
export function sessionAgeGroupKey(
	updatedAt: Date,
	now: Date,
): SessionAgeGroupKey {
	const startOfToday = startOfDay(now);
	const startOfYesterday = new Date(startOfToday.getTime() - MS_PER_DAY);
	const startOfLastWeek = new Date(startOfToday.getTime() - 7 * MS_PER_DAY);
	const startOfLastMonth = new Date(startOfToday.getTime() - 30 * MS_PER_DAY);

	if (updatedAt >= startOfToday) return "today";
	if (updatedAt >= startOfYesterday) return "yesterday";
	if (updatedAt >= startOfLastWeek) return "last7Days";
	if (updatedAt >= startOfLastMonth) return "last30Days";
	return "older";
}

/**
 * Group an already activity-sorted session list into contiguous time buckets.
 * Like the original desktop helper, this coalesces *adjacent* same-key runs (it
 * does not globally regroup), so a recency-ordered list yields the natural
 * Today → Yesterday → … → Older ordering. Pure: same `(sessions, now)` always
 * derives the same groups.
 *
 * @param sessions activity-ordered sessions (most-recent first)
 * @param now server-synced clock; defaults to wall-clock only as a convenience
 */
export function groupSessionsByAge<T extends AgeGroupableSession>(
	sessions: readonly T[],
	now: Date = new Date(),
): SessionAgeGroup<T>[] {
	const groups: SessionAgeGroup<T>[] = [];

	for (const session of sessions) {
		const key = sessionAgeGroupKey(session.updatedAt, now);
		const lastGroup = groups[groups.length - 1];

		if (lastGroup?.key === key) {
			lastGroup.sessions.push(session);
			continue;
		}

		groups.push({
			key,
			olderAt: key === "older" ? session.updatedAt.getTime() : null,
			sessions: [session],
		});
	}

	return groups;
}
