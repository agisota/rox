/**
 * Pure orchestration of the Drive presigned-upload handshake (D8 §2.1),
 * extracted from the React hook so it unit-tests with plain mocks (no DOM,
 * no tRPC, no network).
 *
 * Flow:
 *   1. hash the file bytes (SHA-256 hex content address, DQ1 dedup key)
 *   2. requestUpload → quota pre-flight + dedup check; returns either a
 *      presigned PUT url (`dedup: false`) or a dedup short-circuit
 *      (`dedup: true`, no bytes to send)
 *   3. when not dedup: PUT the raw bytes directly to the bucket url
 *   4. confirmUpload → server HEADs the object + commits quota → `clean`
 *
 * The browser never proxies bytes through the API; it PUTs straight to R2.
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
	/** Raw PUT of bytes to a presigned url. */
	putBytes: (url: string, file: File) => Promise<void>;
	/** tRPC `drive.confirmUpload`. */
	confirmUpload: (input: { fileId: string }) => Promise<unknown>;
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
		return { fileId: requested.fileId, dedup: true };
	}

	if (!requested.upload) {
		throw new Error("requestUpload returned no presigned URL");
	}

	await deps.putBytes(requested.upload.url, file);
	await deps.confirmUpload({ fileId: requested.fileId });
	return { fileId: requested.fileId, dedup: false };
}

/** Default browser PUT: raw bytes, content-type mirrored from the file. */
export async function putBytesViaFetch(url: string, file: File): Promise<void> {
	const response = await fetch(url, {
		method: "PUT",
		body: file,
		headers: { "content-type": file.type || "application/octet-stream" },
	});
	if (!response.ok) {
		throw new Error(`Upload PUT failed with status ${response.status}`);
	}
}
