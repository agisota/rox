/**
 * Public share-token generation (D8 §2.2 `drive_shares.token`).
 *
 * A share link is `rox.one/d/<token>`. The token must be unguessable: D8 calls
 * for >=128-bit url-safe randomness. We draw 192 bits (24 bytes) and base64url
 * encode them (no padding), yielding a 32-char opaque string. `crypto` is the
 * platform Web Crypto (available in Node 18+/Bun/Workers), so the same code
 * runs on every server target.
 */

/** Number of random bytes per token (24 * 8 = 192 bits, > the 128-bit floor). */
export const SHARE_TOKEN_BYTES = 24;

function base64url(bytes: Uint8Array): string {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generate a fresh, url-safe, >=128-bit share token. */
export function generateShareToken(): string {
	const bytes = new Uint8Array(SHARE_TOKEN_BYTES);
	crypto.getRandomValues(bytes);
	return base64url(bytes);
}
