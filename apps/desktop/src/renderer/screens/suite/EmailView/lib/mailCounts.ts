import type { MailPlacement } from "./mailStore";
import type { MailFolderId, MailThreadSummary } from "./mailTypes";

/**
 * Per-folder counts + header aggregates, derived purely from the loaded thread
 * page + the local organization store. Pure + deterministic so it stays
 * trivially testable and recomputes via `useMemo`.
 *
 * UNREAD CAVEAT (recon gap #3): `mail.listThreads` exposes no per-thread unread
 * aggregate. The honest server-derivable signal at the THREAD-ROW level is
 * "activity newer than the last time this thread was opened" — but the row
 * carries no `lastReadAt` either. So a thread counts as unread here when it has
 * never been opened in this session AND is not a single-message outbound-only
 * thread we authored. This is a best-effort client heuristic, NOT an
 * authoritative unread count.
 *
 * TODO(server): replace `unreadThreadIds` with a real `unreadCount` aggregate on
 * `MailThreadSummary` (COUNT of mail_messages WHERE is_read=false AND
 * direction='inbound' GROUPED BY thread_id — `is_read` already exists) and drop
 * the `openedThreadIds` heuristic. Mirrors how `comms.listThreads` returns
 * `unreadCount` today.
 */

export interface MailCounts {
	/** Threads currently in Входящие (not archived/trashed/spam). */
	inbox: number;
	/** Best-effort unread threads in Входящие (see caveat above). */
	inboxUnread: number;
	/** Per-folder visible counts for the rail. */
	byFolder: Record<MailFolderId, number>;
	/** Total threads across the mailbox (header badge). */
	total: number;
	/** Total best-effort unread across Входящие (header badge). */
	totalUnread: number;
}

export interface DeriveCountsArgs {
	threads: MailThreadSummary[];
	placement: Record<string, MailPlacement>;
	flagged: Record<string, true>;
	/** Thread ids the user has opened this session (drives the unread heuristic). */
	openedThreadIds: ReadonlySet<string>;
	/** Number of locally-saved drafts (Черновики badge). */
	draftCount: number;
}

/** Is this thread a single message we sent (so it is "read" by construction)? */
function isOwnSingleOutbound(t: MailThreadSummary): boolean {
	// The thread row has no direction; a 1-message thread the user just sent is
	// the only outbound-only case we can infer cheaply. Treated as read.
	return t.messageCount <= 1;
}

export function deriveMailCounts(args: DeriveCountsArgs): MailCounts {
	const { threads, placement, flagged, openedThreadIds, draftCount } = args;

	let inbox = 0;
	let archive = 0;
	let spam = 0;
	let trash = 0;
	let flaggedCount = 0;
	let inboxUnread = 0;

	for (const t of threads) {
		if (flagged[t.id]) flaggedCount++;
		const place = placement[t.id];
		if (place === "archive") {
			archive++;
			continue;
		}
		if (place === "spam") {
			spam++;
			continue;
		}
		if (place === "trash") {
			trash++;
			continue;
		}
		// Otherwise it lives in Входящие.
		inbox++;
		if (!openedThreadIds.has(t.id) && !isOwnSingleOutbound(t)) {
			inboxUnread++;
		}
	}

	const byFolder: Record<MailFolderId, number> = {
		inbox,
		// `sent` is not thread-row-derivable (no direction column) → 0 until the
		// server exposes it. TODO(server): derive from mail_messages.direction.
		sent: 0,
		drafts: draftCount,
		archive,
		spam,
		trash,
		unread: inboxUnread,
		// `attachments` needs a per-thread has_attachments rollup (absent) → 0.
		// TODO(server): expose hasAttachments on MailThreadSummary.
		attachments: 0,
		flagged: flaggedCount,
	};

	return {
		inbox,
		inboxUnread,
		byFolder,
		total: threads.length,
		totalUnread: inboxUnread,
	};
}
