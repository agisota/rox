/**
 * Derive a human title for a comms thread row. The hub stores `subject` as
 * nullable (chat threads often have none), so the list needs a deterministic
 * fallback. Pure presentation over the already-loaded `comms.listThreads` row —
 * never hits the network. Ported from web `inbox/utils/formatThreadTitle`.
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
