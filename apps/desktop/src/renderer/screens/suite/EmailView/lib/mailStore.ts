import type { RouterOutputs } from "@rox/trpc";
import type { DraftAttachment, MailDraft } from "../components/MailComposer";

/**
 * Mail draft + placement types — SERVER-BACKED (FN-135 / FN-139, #697/#699).
 *
 * The former localStorage organization store is GONE: folder placement + the ⭐
 * flag now live on the `mail_threads` row (`mail.setFolder` / `mail.setFlag`) and
 * drafts live in the `mail_drafts` table (`mail.saveDraft` / `mail.listDrafts` /
 * `mail.deleteDraft`). This module keeps only the renderer-facing draft type +
 * the mapper that turns a `mail.listDrafts` row into it, so the existing composer
 * + drafts-list components consume drafts unchanged.
 */

/** A thread's server-backed folder placement (mirrors the `mail_folder` enum). */
export type MailPlacement = "inbox" | "archive" | "spam" | "trash";

/** One server draft row as returned by `mail.listDrafts`. */
export type MailDraftRow = RouterOutputs["mail"]["listDrafts"][number];

/**
 * A draft surfaced to the composer / drafts list. Keeps the original
 * {@link MailDraft} field shape (`to`/`cc`/`bcc` raw strings) plus the server id,
 * reply thread, and last-edited time so the list can sort + re-open in context.
 */
export interface SavedDraft extends MailDraft {
	id: string;
	/** Thread this draft replies to, if any (for re-opening in context). */
	threadId: string | null;
	updatedAt: number;
}

/** Map a server `mail.listDrafts` row into the renderer {@link SavedDraft}. */
export function toSavedDraft(row: MailDraftRow): SavedDraft {
	return {
		id: row.id,
		threadId: row.threadId ?? null,
		updatedAt: new Date(row.updatedAt).getTime(),
		to: row.toAddrs ?? "",
		cc: row.ccAddrs ?? "",
		bcc: row.bccAddrs ?? "",
		subject: row.subject ?? "",
		body: row.body ?? "",
		attachments: (row.attachments ?? []).map(
			(a): DraftAttachment => ({
				id: a.blobKey ?? `${a.filename}:${a.sizeBytes}`,
				name: a.filename,
				size: a.sizeBytes,
				// Carry the uploaded R2 key forward so a re-opened draft can send
				// its already-staged attachments without re-uploading (#701).
				key: a.blobKey,
				contentType: a.contentType,
			}),
		),
	};
}
