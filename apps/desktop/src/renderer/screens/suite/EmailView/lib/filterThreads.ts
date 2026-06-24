import type { MailPlacement } from "./mailStore";
import type { MailFolderId, MailThreadSummary } from "./mailTypes";

/**
 * Client-side thread filtering for the mailbox.
 *
 * The server `listThreads` feed is the owner's whole mailbox (no per-thread
 * folder/flag/direction columns yet — recon gap #1). To still ship a FULL client
 * the user-controlled organization (archive / trash / spam placement + the star
 * flag) is layered on top from the local {@link MailPlacement} store, so those
 * folders resolve to real, navigable views instead of dead empties:
 *
 *   inbox       → threads with NO placement (the default mailbox)
 *   archive     → threads placed "archive"
 *   spam        → threads placed "spam"
 *   trash       → threads placed "trash"
 *   flagged     → starred threads (not in trash/spam)
 *   unread      → un-opened inbox threads (best-effort, see mailCounts caveat)
 *   sent        → not thread-row-derivable yet → empty (TODO server: direction)
 *   drafts      → served separately from the local draft store (not here)
 *   attachments → needs a per-thread rollup → empty (TODO server)
 *
 * Search is a substring match over the normalized subject (a real `mail.search`
 * FTS endpoint over body/sender is the server follow-up). Pure + deterministic
 * so it stays trivially correct and swaps for a server query the day the columns
 * land — the call site does not change.
 */
export function filterThreads(
	threads: MailThreadSummary[],
	folder: MailFolderId,
	search: string,
	store: {
		placement: Record<string, MailPlacement>;
		flagged: Record<string, true>;
		openedThreadIds: ReadonlySet<string>;
	},
): MailThreadSummary[] {
	const { placement, flagged, openedThreadIds } = store;

	const inFolder = threads.filter((t) => {
		const place = placement[t.id];
		switch (folder) {
			case "inbox":
				return !place;
			case "archive":
				return place === "archive";
			case "spam":
				return place === "spam";
			case "trash":
				return place === "trash";
			case "flagged":
				return Boolean(flagged[t.id]) && place !== "trash" && place !== "spam";
			case "unread":
				return !place && !openedThreadIds.has(t.id) && t.messageCount > 1;
			default:
				// sent / drafts / attachments are not thread-row-derivable here.
				return false;
		}
	});

	const q = search.trim().toLowerCase();
	if (!q) return inFolder;
	return inFolder.filter((t) =>
		(t.subjectNorm ?? "").toLowerCase().includes(q),
	);
}
