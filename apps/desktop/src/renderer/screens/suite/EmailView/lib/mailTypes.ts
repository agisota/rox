import type { RouterOutputs } from "@rox/trpc";

/**
 * Shared mail types for the desktop EmailView surface.
 *
 * Re-derived from the cloud `mail.*` router outputs so the renderer components
 * never drift from the wire contract. `listThreads` returns flat thread rows
 * (subject/last-activity/count — per-message sender + unread live on the
 * messages); `getThread` returns the thread plus its chronological messages.
 */

/** One row of the mailbox thread list (`mail.listThreads`). */
export type MailThreadSummary = RouterOutputs["mail"]["listThreads"][number];

/** The thread row returned by `mail.getThread`. */
export type MailThread = RouterOutputs["mail"]["getThread"]["thread"];

/** A single message inside an opened thread (`mail.getThread`). */
export type MailThreadMessage =
	RouterOutputs["mail"]["getThread"]["messages"][number];

/**
 * The system folders + smart filters of the left rail.
 *
 * P0 reality: `listThreads` does not carry per-thread `direction`/`unread`
 * fields, so only `inbox` resolves to a real server-backed feed. The remaining
 * ids are first-class navigation targets that render an honest scoped state
 * until the server exposes folder/flag columns (see `needsShared`). They are
 * still enumerated here so the rail, keyboard, and routing treat folders
 * uniformly the day the server lands them.
 */
export type MailFolderId =
	| "inbox"
	| "sent"
	| "drafts"
	| "archive"
	| "spam"
	| "trash"
	| "unread"
	| "attachments"
	| "flagged";

export interface MailFolderDef {
	id: MailFolderId;
	label: string;
	/** Lucide icon component. */
	kind: "folder" | "filter";
	/**
	 * Whether this folder resolves to real data in P0. Only `inbox` does today;
	 * the rest depend on server folder/flag columns.
	 */
	serverBacked: boolean;
}
