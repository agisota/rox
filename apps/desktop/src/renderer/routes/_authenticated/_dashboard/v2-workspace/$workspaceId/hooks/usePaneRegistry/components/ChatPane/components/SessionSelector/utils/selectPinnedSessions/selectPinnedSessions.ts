/**
 * Sticky-top pin selection (F19). Splits a session list into the capped pinned
 * group (rendered first) and the remaining sessions (time-grouped downstream).
 *
 * Pure + serializable so the same ordering can be reused by web/mobile clients
 * off the shared `pinned`/`pinnedAt` fields — only the rendering differs.
 */

export interface PinnableSession {
	sessionId: string;
	updatedAt: Date;
	pinned: boolean;
	pinnedAt: Date | null;
}

/**
 * Most-recently-pinned-first; ties (or a missing `pinnedAt`) fall back to
 * activity recency so the order is stable and deterministic.
 */
export function comparePinned(a: PinnableSession, b: PinnableSession): number {
	const aPinned = a.pinnedAt?.getTime() ?? 0;
	const bPinned = b.pinnedAt?.getTime() ?? 0;
	if (aPinned !== bPinned) return bPinned - aPinned;
	return b.updatedAt.getTime() - a.updatedAt.getTime();
}

export interface PinnedSplit<T extends PinnableSession> {
	/** Capped, ordered pinned sessions for the sticky-top group. */
	pinned: T[];
	/** Everything not shown in the pinned group, original order preserved. */
	rest: T[];
}

/**
 * @param sessions full session list (any order)
 * @param cap max sessions in the sticky-top pinned group; excess pinned
 *   sessions fall through to `rest` so they still appear in their time group
 */
export function selectPinnedSessions<T extends PinnableSession>(
	sessions: T[],
	cap: number,
): PinnedSplit<T> {
	const pinned = sessions
		.filter((session) => session.pinned)
		.sort(comparePinned)
		.slice(0, Math.max(0, cap));

	const pinnedIds = new Set(pinned.map((session) => session.sessionId));
	const rest = sessions.filter((session) => !pinnedIds.has(session.sessionId));

	return { pinned, rest };
}
