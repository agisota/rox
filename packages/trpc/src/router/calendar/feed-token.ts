/**
 * Public calendar feed-token generation (Calendar public ICS feed + free-busy).
 *
 * A subscribe feed is `${NEXT_PUBLIC_API_URL}/calendar/feed/<token>`. The token
 * IS the capability — it is the only thing gating an unauthenticated read — so it
 * must be unguessable. We draw 192 bits (24 bytes), well past the 128-bit floor,
 * and base64url-encode them (url-safe, no padding) into a 32-char opaque string.
 * Mirrors {@link generateShareToken} in `drive/token.ts`; `crypto` is the
 * platform Web Crypto (Node 18+/Bun/Workers) so the same code runs everywhere.
 */

/** Number of random bytes per token (24 * 8 = 192 bits, > the 128-bit floor). */
export const FEED_TOKEN_BYTES = 24;

function base64url(bytes: Uint8Array): string {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generate a fresh, url-safe, >=128-bit calendar feed token. */
export function generateFeedToken(): string {
	const bytes = new Uint8Array(FEED_TOKEN_BYTES);
	crypto.getRandomValues(bytes);
	return base64url(bytes);
}
