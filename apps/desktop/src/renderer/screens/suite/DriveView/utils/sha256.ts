/**
 * Browser SHA-256 of a File/Blob, returned as a 64-char lowercase hex digest —
 * the exact content address the Drive router expects (`requestUploadSchema`'s
 * `sha256` regex `^[a-f0-9]{64}$`). This is what makes per-user dedup work
 * end-to-end: the client hashes the bytes, the server short-circuits a
 * re-upload when it already holds that content.
 *
 * Ported from `apps/web/src/app/drive/utils/sha256`. The Electron renderer is
 * Chromium, so Web Crypto `SubtleCrypto` is available exactly as on the web.
 */

/** Encode a digest buffer as a lowercase hex string. */
export function toHex(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let out = "";
	for (const byte of bytes) {
		out += byte.toString(16).padStart(2, "0");
	}
	return out;
}

/** Compute the SHA-256 content address of a file as lowercase hex. */
export async function sha256Hex(file: Blob): Promise<string> {
	const buffer = await file.arrayBuffer();
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	return toHex(digest);
}
