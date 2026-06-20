/**
 * Bridge-ingress authentication for the XMPP component (D4 bridge contract).
 *
 * The XEP-0114 bridge component is the only legitimate caller of
 * `/api/xmpp/inbound`. It signs the raw JSON body with a shared secret (stored
 * in Infisical, never in repo) and stamps a timestamp + nonce so the API can
 * reject forged or replayed POSTs:
 *
 *   X-Rox-Xmpp-Signature: hex(HMAC-SHA256(secret, rawBody))
 *   X-Rox-Xmpp-Timestamp: <unix ms>   - reject if skew > MAX_SKEW_MS (replay)
 *   X-Rox-Xmpp-Nonce:     <uuid>       - single-use within the skew window
 *
 * Pure + dependency-light (Web Crypto only) so it runs on any server target and
 * unit-tests without a live request. Mirrors `lib/mail/verify.ts` (D3) exactly,
 * with XMPP-namespaced headers so the two ingress secrets stay independent.
 */

export const XMPP_SIGNATURE_HEADER = "x-rox-xmpp-signature";
export const XMPP_TIMESTAMP_HEADER = "x-rox-xmpp-timestamp";
export const XMPP_NONCE_HEADER = "x-rox-xmpp-nonce";

/** Reject a timestamp skewed more than 5 minutes from now (replay window). */
export const MAX_SKEW_MS = 5 * 60 * 1000;

export interface XmppSignatureHeaders {
	signature: string | null;
	timestamp: string | null;
	nonce: string | null;
}

export type VerifyResult =
	| { ok: true; nonce: string }
	| { ok: false; reason: "missing_headers" | "bad_signature" | "stale" };

/** Read the three auth headers from a request. */
export function readXmppHeaders(headers: Headers): XmppSignatureHeaders {
	return {
		signature: headers.get(XMPP_SIGNATURE_HEADER),
		timestamp: headers.get(XMPP_TIMESTAMP_HEADER),
		nonce: headers.get(XMPP_NONCE_HEADER),
	};
}

/** Lowercase hex encode a byte buffer. */
function toHex(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let out = "";
	for (const b of bytes) out += b.toString(16).padStart(2, "0");
	return out;
}

/** Compute `hex(HMAC-SHA256(secret, body))` using Web Crypto. */
export async function computeXmppSignature(
	secret: string,
	body: string,
): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
	return toHex(sig);
}

/** Constant-time compare of two equal-length hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

/**
 * Verify the signature + timestamp skew. The nonce replay guard is enforced by
 * the caller (it needs a durable/short-TTL store); this returns the validated
 * nonce so the caller can record it.
 */
export async function verifyXmppSignature(args: {
	secret: string;
	body: string;
	headers: XmppSignatureHeaders;
	now?: number;
}): Promise<VerifyResult> {
	const { secret, body, headers } = args;
	const now = args.now ?? Date.now();

	if (!headers.signature || !headers.timestamp || !headers.nonce) {
		return { ok: false, reason: "missing_headers" };
	}

	const ts = Number(headers.timestamp);
	if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) {
		return { ok: false, reason: "stale" };
	}

	const expected = await computeXmppSignature(secret, body);
	if (!timingSafeEqualHex(expected, headers.signature.toLowerCase())) {
		return { ok: false, reason: "bad_signature" };
	}

	return { ok: true, nonce: headers.nonce };
}
