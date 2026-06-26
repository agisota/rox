import type { SelectDurableSession } from "@rox/db/schema";
import {
	deriveSurfaceStatus,
	type WorkspaceSurfaceStatus,
} from "@rox/shared/workspace-status";

/**
 * The shape a workspace card consumes for one surface (Claude session or
 * terminal). Platform-agnostic so the same selector output drives mobile today
 * and web/desktop later.
 */
export interface WorkspaceSurface {
	/** Derived badge status (idle|connecting|live|ended|error|unavailable). */
	status: WorkspaceSurfaceStatus;
	/** Human label for the surface (session/terminal title), or null. */
	title: string | null;
	/** When the surface was last active, or null if never. */
	lastActiveAt: Date | null;
	/** Id of the underlying row, or null when no surface exists for the ws. */
	id: string | null;
}

/** A surface with no backing row: nothing has synced for this workspace yet. */
const EMPTY_SURFACE: WorkspaceSurface = {
	status: "unavailable",
	title: null,
	lastActiveAt: null,
	id: null,
};

function toDate(value: Date | string | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function toTime(value: Date | string | null | undefined): number {
	const date = toDate(value);
	return date ? date.getTime() : 0;
}

/**
 * Pick the most relevant durable Claude session for a workspace and derive its
 * surface status. "Most relevant" = the newest by `lastActiveAt`, falling back
 * to `createdAt`, so a freshly resumed session wins over an older ended one.
 *
 * Pure: takes plain rows (not Electric collections) so it can be unit tested
 * without network/env. `isConnecting` lets the hook surface `connecting` while
 * the collection's first snapshot is still loading.
 */
export function selectClaudeSession(
	sessions: SelectDurableSession[] | undefined,
	workspaceId: string,
	options: { isConnecting?: boolean; hostOnline?: boolean | null } = {},
): WorkspaceSurface {
	if (!workspaceId || !sessions || sessions.length === 0) {
		// No data: if we're still connecting, say so; otherwise unavailable.
		return options.isConnecting
			? { ...EMPTY_SURFACE, status: "connecting" }
			: EMPTY_SURFACE;
	}

	let best: SelectDurableSession | null = null;
	let bestTime = -1;
	for (const session of sessions) {
		if (session.workspaceId !== workspaceId) continue;
		const time = Math.max(
			toTime(session.lastActiveAt),
			toTime(session.createdAt),
		);
		if (time > bestTime) {
			best = session;
			bestTime = time;
		}
	}

	if (!best) {
		return options.isConnecting
			? { ...EMPTY_SURFACE, status: "connecting" }
			: EMPTY_SURFACE;
	}

	return {
		status: deriveSurfaceStatus({
			lifecycle: best.status,
			hostOnline: options.hostOnline,
			isConnecting: options.isConnecting,
		}),
		title: best.title ?? null,
		lastActiveAt: toDate(best.lastActiveAt),
		id: best.id,
	};
}
