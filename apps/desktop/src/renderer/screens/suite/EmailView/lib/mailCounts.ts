import type { MailFolderId, MailThreadSummary } from "./mailTypes";

/**
 * Per-folder counts + header aggregates, derived from the loaded thread page —
 * SERVER-BACKED (FN-135 / #697). `mail.listThreads` now returns the real
 * per-thread `folder` placement + `isFlagged` + `unreadCount` + `hasAttachments`,
 * so every count below is authoritative server state (no localStorage overlay, no
 * "opened this session" unread heuristic). Pure + deterministic so it stays
 * trivially testable and recomputes via `useMemo`.
 */

export interface MailCounts {
	/** Threads currently in Входящие (folder === "inbox"). */
	inbox: number;
	/** Real unread threads in Входящие (any inbound-unread message). */
	inboxUnread: number;
	/** Per-folder visible counts for the rail. */
	byFolder: Record<MailFolderId, number>;
	/** Total threads across the loaded page (header badge). */
	total: number;
	/** Total real unread across Входящие (header badge). */
	totalUnread: number;
}

export interface DeriveCountsArgs {
	threads: MailThreadSummary[];
	/** Number of server-backed drafts (Черновики badge). */
	draftCount: number;
	/** Number of sent threads, if a sent feed is loaded (else 0). */
	sentCount?: number;
}

export function deriveMailCounts(args: DeriveCountsArgs): MailCounts {
	const { threads, draftCount, sentCount = 0 } = args;

	let inbox = 0;
	let archive = 0;
	let spam = 0;
	let trash = 0;
	let flaggedCount = 0;
	let attachmentsCount = 0;
	let inboxUnread = 0;

	for (const t of threads) {
		const inActiveFolder = t.folder !== "trash" && t.folder !== "spam";
		if (t.isFlagged && inActiveFolder) flaggedCount++;
		if (t.hasAttachments && inActiveFolder) attachmentsCount++;

		switch (t.folder) {
			case "archive":
				archive++;
				break;
			case "spam":
				spam++;
				break;
			case "trash":
				trash++;
				break;
			default:
				inbox++;
				if (t.unreadCount > 0) inboxUnread++;
				break;
		}
	}

	const byFolder: Record<MailFolderId, number> = {
		inbox,
		sent: sentCount,
		drafts: draftCount,
		archive,
		spam,
		trash,
		unread: inboxUnread,
		attachments: attachmentsCount,
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
