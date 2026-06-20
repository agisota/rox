/**
 * Derive a human title + preview for an inbox thread row.
 *
 * The comms hub stores `subject` as nullable (chat threads often have none), so
 * the list needs a deterministic fallback. We never hit the network for this —
 * it is pure presentation over the already-loaded `comms.listThreads` row.
 */

export interface ThreadTitleInput {
	/** The thread's stored subject, if any. */
	subject: string | null | undefined;
	/** Thread id — used as the last-resort label so rows are never blank. */
	id: string;
}

/** A short, stable label for a thread that has no subject. */
export function formatThreadTitle({ subject, id }: ThreadTitleInput): string {
	const trimmed = subject?.trim();
	if (trimmed) return trimmed;
	// Chat threads frequently lack a subject; show a stable short id so the row
	// is identifiable and the list never renders an empty cell.
	return `Тред ${id.slice(0, 8)}`;
}
