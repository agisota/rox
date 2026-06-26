import type { DraftAttachment } from "../components/MailComposer";

/**
 * Client-side outbound attachment upload (FN-141 / #701).
 *
 * For each staged file that does not yet have an R2 `key`: hash the bytes
 * (sha256), ask the server for a presigned PUT (`mail.presignAttachmentUpload`,
 * which derives an owner-scoped content-addressed key), PUT the bytes straight to
 * R2, then return the `{ key, filename, contentType, sizeBytes }` descriptor
 * `mail.send` expects. Files that already carry a `key` (re-opened persisted
 * drafts) pass straight through with no re-upload.
 *
 * Pure-ish + injectable: the presign fn and `fetch` are parameters so this is
 * unit-testable without a live tRPC client or network. Bytes go DIRECT to R2 —
 * never through the API — so large files never inflate a tRPC request.
 */

/** What `mail.send` needs per attachment. */
export interface OutboundAttachmentRef {
	key: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
}

/** The presign call shape (a thin wrapper over `mail.presignAttachmentUpload`). */
export type PresignUploadFn = (input: {
	filename: string;
	contentType: string;
	sizeBytes: number;
	sha256: string;
}) => Promise<{ key: string; url: string }>;

/** Hex sha256 of an ArrayBuffer via WebCrypto (available in the renderer). */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Upload every not-yet-uploaded staged attachment and return the send-ready
 * descriptors (in input order). Throws if a staged file has neither a `File`
 * handle nor a pre-existing `key` (a malformed draft), so a send never silently
 * drops an attachment the user added.
 */
export async function uploadDraftAttachments(
	attachments: readonly DraftAttachment[],
	presign: PresignUploadFn,
	fetchImpl: typeof fetch = fetch,
): Promise<OutboundAttachmentRef[]> {
	const out: OutboundAttachmentRef[] = [];
	for (const att of attachments) {
		// Already uploaded (re-opened persisted draft) — reuse the key as-is.
		if (att.key) {
			out.push({
				key: att.key,
				filename: att.name,
				contentType: att.contentType ?? "application/octet-stream",
				sizeBytes: att.size,
			});
			continue;
		}
		if (!att.file) {
			throw new Error(`Attachment "${att.name}" has no file bytes to upload.`);
		}
		const contentType = att.contentType ?? "application/octet-stream";
		const bytes = await att.file.arrayBuffer();
		const sha256 = await sha256Hex(bytes);
		const { key, url } = await presign({
			filename: att.name,
			contentType,
			sizeBytes: att.size,
			sha256,
		});
		const res = await fetchImpl(url, {
			method: "PUT",
			headers: { "Content-Type": contentType },
			body: bytes,
		});
		if (!res.ok) {
			throw new Error(`Upload failed for "${att.name}" (HTTP ${res.status}).`);
		}
		out.push({ key, filename: att.name, contentType, sizeBytes: att.size });
	}
	return out;
}
