"use client";

import { useCallback, useState } from "react";

import { trpcClient } from "@/trpc/client";
import { sha256Hex } from "../../utils/sha256Hex";

/**
 * A composer attachment that has finished uploading and can be sent with a
 * message. Matches the comms `attachmentSchema` shape (name/url/contentType/
 * size) so it slots straight into `comms.sendMessage`.
 */
export interface ComposerAttachment {
	/** Local id for list keys + removal. */
	localId: string;
	name: string;
	url: string;
	contentType: string;
	size: number;
	/** The Drive file id (kept for traceability; not sent in the message). */
	fileId: string;
}

/** An attachment still being hashed/uploaded. */
export interface PendingAttachment {
	localId: string;
	name: string;
	size: number;
}

let counter = 0;
const nextLocalId = () => `att-${Date.now().toString(36)}-${counter++}`;

/**
 * Composer attachments backed by the Drive presigned-upload flow.
 *
 * Per the spec, file attachments reuse Drive: hash the file → `requestUpload`
 * (presigned PUT or dedup short-circuit) → PUT the bytes → `confirmUpload`, then
 * mint a short-lived `requestDownload` URL to embed as the attachment's `url`.
 * The finished chips are returned for the composer to render and to attach to
 * `comms.sendMessage`.
 */
export function useComposerAttachments() {
	const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
	const [pending, setPending] = useState<PendingAttachment[]>([]);
	const [error, setError] = useState<string | null>(null);

	const addFiles = useCallback(async (files: FileList | File[]) => {
		const list = Array.from(files);
		for (const file of list) {
			const localId = nextLocalId();
			setError(null);
			setPending((p) => [...p, { localId, name: file.name, size: file.size }]);

			try {
				const buffer = await file.arrayBuffer();
				const sha256 = await sha256Hex(buffer);
				const mediaType = file.type || "application/octet-stream";

				const requested = await trpcClient.drive.requestUpload.mutate({
					filename: file.name,
					mediaType,
					sizeBytes: file.size,
					sha256,
				});

				// New content: PUT the bytes to the presigned URL, then confirm.
				if (!requested.dedup && requested.upload) {
					const put = await fetch(requested.upload.url, {
						method: "PUT",
						headers: { "Content-Type": mediaType },
						body: file,
					});
					if (!put.ok) {
						throw new Error(`Upload failed with status ${put.status}`);
					}
					await trpcClient.drive.confirmUpload.mutate({
						fileId: requested.fileId,
					});
				}

				// Mint a short-lived download URL to embed in the message.
				const download = await trpcClient.drive.requestDownload.mutate({
					fileId: requested.fileId,
				});

				setAttachments((a) => [
					...a,
					{
						localId,
						name: file.name,
						url: download.url,
						contentType: mediaType,
						size: file.size,
						fileId: requested.fileId,
					},
				]);
			} catch (err) {
				console.error("[useComposerAttachments] upload failed", err);
				setError(`Не удалось загрузить «${file.name}»`);
			} finally {
				setPending((p) => p.filter((x) => x.localId !== localId));
			}
		}
	}, []);

	const removeAttachment = useCallback((localId: string) => {
		setAttachments((a) => a.filter((x) => x.localId !== localId));
	}, []);

	const clear = useCallback(() => {
		setAttachments([]);
		setPending([]);
		setError(null);
	}, []);

	return {
		attachments,
		pending,
		error,
		isUploading: pending.length > 0,
		addFiles,
		removeAttachment,
		clear,
	};
}
