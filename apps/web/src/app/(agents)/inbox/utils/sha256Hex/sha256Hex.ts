/**
 * Compute the lowercase-hex SHA-256 of a file's bytes.
 *
 * The Drive router is content-addressed (DQ1): `requestUpload` requires the
 * 64-char hex digest so it can dedup and build the `u/<userId>/<sha256>` key.
 * Uses the Web Crypto `SubtleCrypto` digest available in the browser.
 */

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
