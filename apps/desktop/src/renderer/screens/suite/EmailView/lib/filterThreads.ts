import type { MailFolderId, MailThreadSummary } from "./mailTypes";

/**
 * Client-side thread filtering for the mailbox — SERVER-BACKED (FN-135 / #697).
 *
 * `mail.listThreads` now returns the real per-thread `folder` placement +
 * `isFlagged` flag + `unreadCount` + `hasAttachments` aggregates, so the left
 * rail resolves to authoritative server state instead of a localStorage overlay:
 *
 *   inbox       → folder === "inbox"
 *   archive     → folder === "archive"
 *   spam        → folder === "spam"
 *   trash       → folder === "trash"
 *   flagged     → isFlagged && folder not in {trash, spam}
 *   unread      → folder === "inbox" && unreadCount > 0
 *   attachments → hasAttachments && folder not in {trash, spam}
 *   sent        → served by the dedicated sent feed (direction='outbound'), not here
 *   drafts      → served from `mail.listDrafts` (not here)
 *
 * Free-text search is delegated to the `mail.search` FTS endpoint upstream (the
 * EmailView swaps the thread feed for search results), so this function no longer
 * substring-filters: it only resolves the active folder over already-fetched
 * rows. Pure + deterministic so it stays trivially correct.
 */
export function filterThreads(
	threads: MailThreadSummary[],
	folder: MailFolderId,
): MailThreadSummary[] {
	return threads.filter((t) => {
		switch (folder) {
			case "inbox":
				return t.folder === "inbox";
			case "archive":
				return t.folder === "archive";
			case "spam":
				return t.folder === "spam";
			case "trash":
				return t.folder === "trash";
			case "flagged":
				return t.isFlagged && t.folder !== "trash" && t.folder !== "spam";
			case "unread":
				return t.folder === "inbox" && t.unreadCount > 0;
			case "attachments":
				return t.hasAttachments && t.folder !== "trash" && t.folder !== "spam";
			default:
				// sent / drafts are served by their own feeds, not from this page.
				return false;
		}
	});
}
