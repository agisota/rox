/**
 * Bridge-ingress authentication for the standalone transcribe-worker (Live STT
 * Phase-2). The trusted `workers/transcribe-worker` process is the only
 * legitimate caller of `POST /api/voice/segment`: it streams a live voice room
 * through Deepgram and, per FINAL segment, signs the raw JSON body with a shared
 * secret (`TRANSCRIBE_INGEST_SECRET`) and stamps a timestamp + single-use nonce so
 * the API can reject forged or replayed POSTs:
 *
 *   X-Rox-Transcript-Signature: hex(HMAC-SHA256(secret, rawBody))
 *   X-Rox-Transcript-Timestamp: <unix ms>   - reject if skew > MAX_SKEW_MS (replay)
 *   X-Rox-Transcript-Nonce:     <uuid>       - single-use within the skew window
 *
 * This MIRRORS `lib/mesh/verify.ts` (the shipped `/api/mesh/inbound` D5 ingress)
 * byte-for-byte in scheme, with TRANSCRIPT-namespaced headers + an independent
 * secret so the two server bridges never share an ingress credential. The signing
 * counterpart is the shipped, CI-tested CLIENT half in
 * `workers/transcribe-worker/src/segment-writer.ts` (`computeSegmentSignature` /
 * `buildSignedSegmentRequest`), whose golden test fixes the exact header names +
 * `hex(HMAC-SHA256(secret, body))` contract this verifier checks against.
 *
 * Pure + dependency-light (Web Crypto only) so it runs on any server target and
 * unit-tests without a live request — same shape as the mesh verifier.
 */

export const SEGMENT_SIGNATURE_HEADER = "x-rox-transcript-signature";
export const SEGMENT_TIMESTAMP_HEADER = "x-rox-transcript-timestamp";
export const SEGMENT_NONCE_HEADER = "x-rox-transcript-nonce";

/** Reject a timestamp skewed more than 5 minutes from now (replay window). */
export const MAX_SKEW_MS = 5 * 60 * 1000;

export interface SegmentSignatureHeaders {
	signature: string | null;
	timestamp: string | null;
	nonce: string | null;
}

export type VerifyResult =
	| { ok: true; nonce: string }
	| { ok: false; reason: "missing_headers" | "bad_signature" | "stale" };

/** Read the three auth headers from a request. */
export function readSegmentHeaders(headers: Headers): SegmentSignatureHeaders {
	return {
		signature: headers.get(SEGMENT_SIGNATURE_HEADER),
		timestamp: headers.get(SEGMENT_TIMESTAMP_HEADER),
		nonce: headers.get(SEGMENT_NONCE_HEADER),
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
export async function computeSegmentSignature(
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
 * nonce so the caller can record it. Mirrors `verifyMeshSignature`.
 */
export async function verifySegmentSignature(args: {
	secret: string;
	body: string;
	headers: SegmentSignatureHeaders;
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

	const expected = await computeSegmentSignature(secret, body);
	if (!timingSafeEqualHex(expected, headers.signature.toLowerCase())) {
		return { ok: false, reason: "bad_signature" };
	}

	return { ok: true, nonce: headers.nonce };
}

/**
 * Parse the organization id back out of an org-scoped voice room name
 * (`org:{organizationId}:voice:{channelId}`). Inlined (kept byte-identical to
 * `@rox/rtc`'s `organizationIdFromRoomName`) rather than importing `@rox/rtc`,
 * which is NOT a dependency of `@rox/api` — adding it would perturb the frozen
 * root install for a two-line regex. This is the SECURITY seam: the worker only
 * joins rooms it was dispatched to and the org is taken from the room name it
 * observed, so a client-supplied org is never trusted on the wire.
 */
export function organizationIdFromRoomName(roomName: string): string | null {
	const match = /^org:([^:]+):voice:/.exec(roomName);
	return match ? (match[1] ?? null) : null;
}
