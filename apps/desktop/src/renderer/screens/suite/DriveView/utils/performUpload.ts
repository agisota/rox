/**
 * Pure orchestration of the Drive presigned-upload handshake, ported from
 * `apps/web/src/app/drive/hooks/useDriveUpload/performUpload.ts` and upgraded
 * with a real XHR-progress PUT (the web version PUTs via `fetch` with no
 * progress, so its tray could only show a spinner).
 *
 * Flow:
 *   1. hash the file bytes (SHA-256 hex content address, dedup key)
 *   2. requestUpload → quota pre-flight + dedup check; returns either a
 *      presigned PUT url (`dedup: false`) or a dedup short-circuit
 *      (`dedup: true`, no bytes to send)
 *   3. when not dedup: PUT the raw bytes directly to the bucket url, streaming
 *      true upload progress via `XMLHttpRequest.upload.onprogress`
 *   4. confirmUpload → server HEADs the object + commits quota → `clean`
 *
 * The renderer never proxies bytes through the API; it PUTs straight to R2.
 * Kept DI-pure (no tRPC, no React) so it unit-tests with plain mocks.
 */

export interface RequestUploadResult {
	dedup: boolean;
	fileId: string;
	storageKey: string;
	upload: { url: string; expiresAt: Date | string } | null;
}

export interface PerformUploadDeps {
	/** SHA-256 hex of the file (content address). */
	hash: (file: File) => Promise<string>;
	/** tRPC `drive.requestUpload`. */
	requestUpload: (input: {
		filename: string;
		mediaType: string;
		sizeBytes: number;
		sha256: string;
		folderId: string | null;
	}) => Promise<RequestUploadResult>;
	/** Raw PUT of bytes to a presigned url, reporting fractional progress. */
	putBytes: (
		url: string,
		file: File,
		onProgress?: (fraction: number) => void,
	) => Promise<void>;
	/** tRPC `drive.confirmUpload`. */
	confirmUpload: (input: { fileId: string }) => Promise<unknown>;
	/** Optional 0..1 progress sink for the PUT phase. */
	onProgress?: (fraction: number) => void;
}

export interface PerformUploadOutcome {
	fileId: string;
	dedup: boolean;
}

export async function performUpload(
	file: File,
	folderId: string | null,
	deps: PerformUploadDeps,
): Promise<PerformUploadOutcome> {
	const sha256 = await deps.hash(file);

	const requested = await deps.requestUpload({
		filename: file.name,
		mediaType: file.type || "application/octet-stream",
		sizeBytes: file.size,
		sha256,
		folderId,
	});

	if (requested.dedup) {
		// Server already holds this content for this user — nothing to upload.
		deps.onProgress?.(1);
		return { fileId: requested.fileId, dedup: true };
	}

	if (!requested.upload) {
		throw new Error("requestUpload returned no presigned URL");
	}

	await deps.putBytes(requested.upload.url, file, deps.onProgress);
	await deps.confirmUpload({ fileId: requested.fileId });
	deps.onProgress?.(1);
	return { fileId: requested.fileId, dedup: false };
}

/**
 * Real-progress PUT over `XMLHttpRequest` so the upload tray can show a
 * determinate ring (`upload.onprogress` fires with loaded/total). Mirrors the
 * `fetch` semantics of the web `putBytesViaFetch` (raw body, content-type from
 * the file) but exposes byte-level progress.
 */
export function putBytesViaXhr(
	url: string,
	file: File,
	onProgress?: (fraction: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("PUT", url, true);
		xhr.setRequestHeader(
			"content-type",
			file.type || "application/octet-stream",
		);
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable && onProgress) {
				onProgress(event.loaded / event.total);
			}
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve();
			} else {
				reject(new Error(`Upload PUT failed with status ${xhr.status}`));
			}
		};
		xhr.onerror = () => reject(new Error("Upload PUT failed (network error)"));
		xhr.onabort = () => reject(new Error("Upload cancelled"));
		xhr.send(file);
	});
}
