import type { MailFolderId, MailThreadSummary } from "./mailTypes";

/**
 * Client-side thread filtering for P0.
 *
 * The server `listThreads` feed is the owner's whole mailbox (no per-thread
 * folder/flag/direction columns yet — see `needsShared`). So in P0 only the
 * `inbox` folder shows the real feed; the other folders/filters resolve to an
 * empty list and surface their honest empty copy. Search is a substring match
 * over the normalized subject (a real `mail.search` FTS endpoint is P1).
 *
 * This is intentionally pure so it stays trivially correct + testable and can be
 * swapped for a server query the moment those columns land.
 */
export function filterThreads(
	threads: MailThreadSummary[],
	folder: MailFolderId,
	search: string,
): MailThreadSummary[] {
	// Only the inbox is server-backed today; every other folder/filter has no
	// derivable signal on the thread row, so it is honestly empty.
	if (folder !== "inbox") return [];

	const q = search.trim().toLowerCase();
	if (!q) return threads;

	return threads.filter((t) => (t.subjectNorm ?? "").toLowerCase().includes(q));
}
