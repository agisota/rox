/**
 * Object comments (#11, `collaboration.threadsAsObjects`) — pure, dependency-free
 * helpers for a durable comment thread anchored to a Project-OS object.
 *
 * Single source of truth shared by every client surface (web `(agents)`, desktop
 * `ProjectObjectGraph`, and any future mobile surface) so the comment
 * list/compose logic is unit-tested once and the render layers stay thin. No
 * React, no tRPC, no db imports — mirrors the `crm-contacts` / `unified-search`
 * shared-core pattern. The cloud graph router (`graph.comments.list` /
 * `graph.comments.create`) is the runtime source of truth for the data.
 */

/** A comment as surfaced in a panel (mirror of `graph.comments.list` output). */
export interface PanelComment {
	id: string;
	threadId: string;
	authorUserId: string | null;
	body: string;
	createdAt: string | Date;
}

/** Max comment length the compose box accepts (matches the router schema). */
export const COMMENT_MAX_LENGTH = 10_000;

/** Coerce a comment timestamp (Date or ISO string) to epoch millis for sort. */
function toEpoch(value: string | Date): number {
	const ms = value instanceof Date ? value.getTime() : Date.parse(value);
	return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Order comments oldest → newest (chat transcript order). Stable + non-mutating;
 * the server already returns this order, but a panel re-sorts so Electric-synced
 * rows arriving out of order still render chronologically.
 */
export function sortCommentsOldestFirst(
	comments: readonly PanelComment[],
): PanelComment[] {
	return [...comments].sort(
		(a, b) => toEpoch(a.createdAt) - toEpoch(b.createdAt),
	);
}

/**
 * Whether the compose box may submit `draft`: non-empty after trimming, within
 * the length cap, and not already submitting. Drives the Send button's disabled
 * state and guards the mutation.
 */
export function canSubmitComment(draft: string, pending: boolean): boolean {
	if (pending) return false;
	const trimmed = draft.trim();
	return trimmed.length > 0 && trimmed.length <= COMMENT_MAX_LENGTH;
}
