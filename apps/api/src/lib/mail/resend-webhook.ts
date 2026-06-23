/**
 * Resend (Svix) delivery webhook verification (D3 / M4).
 *
 * Resend signs every webhook with the Svix scheme. The three headers are:
 *
 *   svix-id        : message id (also the dedup key)
 *   svix-timestamp : unix seconds — reject if skewed (replay window)
 *   svix-signature : space-separated `v1,<base64 HMAC-SHA256>` entries
 *
 * The signature is `base64(HMAC-SHA256(secretBytes, "<id>.<timestamp>.<body>"))`
 * where `secretBytes = base64decode(secret_without_"whsec_"_prefix)`. We verify
 * with Web Crypto only — no `svix` dependency — so this runs on any server
 * target and unit-tests without a live request (mirrors `verify.ts`).
 *
 * GATED: the route is inert without `RESEND_WEBHOOK_SECRET` and fails closed.
 */

export const SVIX_ID_HEADER = "svix-id";
export const SVIX_TIMESTAMP_HEADER = "svix-timestamp";
export const SVIX_SIGNATURE_HEADER = "svix-signature";

/** Reject a timestamp skewed more than 5 minutes from now (replay window). */
export const MAX_SKEW_MS = 5 * 60 * 1000;

export interface SvixHeaders {
	id: string | null;
	timestamp: string | null;
	signature: string | null;
}

export type ResendVerifyResult =
	| { ok: true; id: string }
	| { ok: false; reason: "missing_headers" | "bad_signature" | "stale" };

/** Read the three Svix auth headers from a request. */
export function readSvixHeaders(headers: Headers): SvixHeaders {
	return {
		id: headers.get(SVIX_ID_HEADER),
		timestamp: headers.get(SVIX_TIMESTAMP_HEADER),
		signature: headers.get(SVIX_SIGNATURE_HEADER),
	};
}

/** Strip the `whsec_` prefix and base64-decode the signing secret into bytes. */
function decodeSecret(secret: string): ArrayBuffer {
	const raw = secret.startsWith("whsec_")
		? secret.slice("whsec_".length)
		: secret;
	const binary = atob(raw);
	const buf = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(buf);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return buf;
}

/** base64 encode a byte buffer. */
function toBase64(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
}

/** Compute `base64(HMAC-SHA256(secretBytes, "<id>.<ts>.<body>"))`. */
export async function computeSvixSignature(args: {
	secret: string;
	id: string;
	timestamp: string;
	body: string;
}): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		decodeSecret(args.secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signed = `${args.id}.${args.timestamp}.${args.body}`;
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signed));
	return toBase64(sig);
}

/** Constant-time compare of two strings. */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/**
 * Verify the Svix signature + timestamp skew. The `svix-signature` header may
 * carry multiple space-separated `v1,<sig>` entries; a match against ANY entry
 * passes. Returns the validated `svix-id` for webhook dedup.
 */
export async function verifyResendWebhook(args: {
	secret: string;
	body: string;
	headers: SvixHeaders;
	now?: number;
}): Promise<ResendVerifyResult> {
	const { secret, body, headers } = args;
	const now = args.now ?? Date.now();

	if (!headers.id || !headers.timestamp || !headers.signature) {
		return { ok: false, reason: "missing_headers" };
	}

	const tsSeconds = Number(headers.timestamp);
	if (
		!Number.isFinite(tsSeconds) ||
		Math.abs(now - tsSeconds * 1000) > MAX_SKEW_MS
	) {
		return { ok: false, reason: "stale" };
	}

	const expected = await computeSvixSignature({
		secret,
		id: headers.id,
		timestamp: headers.timestamp,
		body,
	});

	// Header is space-separated `<version>,<base64sig>` entries.
	const candidates = headers.signature
		.split(" ")
		.map((part) => {
			const comma = part.indexOf(",");
			return comma === -1 ? part : part.slice(comma + 1);
		})
		.filter(Boolean);

	for (const candidate of candidates) {
		if (timingSafeEqual(expected, candidate)) {
			return { ok: true, id: headers.id };
		}
	}
	return { ok: false, reason: "bad_signature" };
}
