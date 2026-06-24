/**
 * Persist a finalized transcript segment to durable storage via a SIGNED POST.
 *
 * The worker is a trusted server bridge; it authenticates to the rox API exactly
 * like `workers/mesh-relay-watcher` does for `/api/mesh/inbound`: HMAC-SHA256 over
 * the raw JSON body with a shared secret (`TRANSCRIBE_INGEST_SECRET`), plus a
 * timestamp and a single-use nonce. The server side validates the same headers and
 * writes the row into `live_transcript_segments` (the SAME table the Phase-1
 * `voice.transcribeChunk` mutation persists to), so the streaming finals and the
 * chunked finals share one replayable log.
 *
 * SCOPE HONESTY: the receiving route `POST /api/voice/segment` is the documented
 * server-side integration point for this worker; wiring it into the rox API and
 * provisioning the secret is the deploy follow-up (mirrors how the mesh inbound
 * route + escrow key are deploy-gated). This module is the runnable, unit-tested
 * CLIENT half of that contract — the signed-envelope shape is provable without a
 * live API because `fetch`/`crypto` are injectable.
 *
 * SECURITY: the secret is used only to compute the HMAC; it is never logged and
 * never placed in the body or any header value other than the derived signature.
 */

import { webcrypto } from "node:crypto";
import type { TranscriptWireSegment } from "./wire";

export const SEGMENT_SIGNATURE_HEADER = "x-rox-transcript-signature";
export const SEGMENT_TIMESTAMP_HEADER = "x-rox-transcript-timestamp";
export const SEGMENT_NONCE_HEADER = "x-rox-transcript-nonce";

const cryptoImpl: Crypto =
	(globalThis.crypto as Crypto | undefined) ?? (webcrypto as unknown as Crypto);

function toHex(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let out = "";
	for (const b of bytes) out += b.toString(16).padStart(2, "0");
	return out;
}

/** Compute `hex(HMAC-SHA256(secret, body))` — identical to the server verify. */
export async function computeSegmentSignature(
	secret: string,
	body: string,
	subtle: SubtleCrypto = cryptoImpl.subtle,
): Promise<string> {
	const enc = new TextEncoder();
	const key = await subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await subtle.sign("HMAC", key, enc.encode(body));
	return toHex(sig);
}

/** The body the worker persists: the wire segment + its room + speaker context. */
export interface SegmentPersistPayload {
	/** Org-scoped room name the segment belongs to. */
	roomName: string;
	segment: TranscriptWireSegment;
}

export interface SignedSegmentRequest {
	url: string;
	body: string;
	headers: Record<string, string>;
}

export interface BuildSignedSegmentOptions {
	apiUrl: string;
	secret: string;
	payload: SegmentPersistPayload;
	now?: () => number;
	nonce?: () => string;
	subtle?: SubtleCrypto;
}

/**
 * Build the signed request (url + body + the three auth headers) for one segment.
 * Split from the network call so the signing contract is unit-testable and the
 * caller can transport/retry however it likes.
 */
export async function buildSignedSegmentRequest(
	opts: BuildSignedSegmentOptions,
): Promise<SignedSegmentRequest> {
	const now = opts.now ?? Date.now;
	const nonceFn = opts.nonce ?? (() => cryptoImpl.randomUUID());

	// HMAC over the EXACT bytes the server reads → serialize once.
	const body = JSON.stringify(opts.payload);
	const timestamp = String(now());
	const nonce = nonceFn();
	const signature = await computeSegmentSignature(
		opts.secret,
		body,
		opts.subtle,
	);

	const base = opts.apiUrl.replace(/\/+$/, "");
	return {
		url: `${base}/api/voice/segment`,
		body,
		headers: {
			"content-type": "application/json",
			[SEGMENT_SIGNATURE_HEADER]: signature,
			[SEGMENT_TIMESTAMP_HEADER]: timestamp,
			[SEGMENT_NONCE_HEADER]: nonce,
		},
	};
}

export interface SegmentPersistResult {
	status: number;
	ok: boolean;
	/** The durable row id the API returned, when it echoes one (else null). */
	id: string | null;
}

/**
 * The injectable persistence seam the orchestrator calls per final. Returns the
 * HTTP status + (optionally) the durable row id so a re-publish can dedupe on it.
 */
export type SegmentWriter = (
	payload: SegmentPersistPayload,
) => Promise<SegmentPersistResult>;

/**
 * Build a `SegmentWriter` that signs + POSTs to `POST /api/voice/segment`. The
 * `fetchImpl` is injectable so the orchestrator tests assert the signed envelope
 * without a live API. A non-2xx response resolves (does not throw) so one failed
 * persist never tears down the live stream — the segment was already fanned out.
 */
export function createSignedSegmentWriter(opts: {
	apiUrl: string;
	secret: string;
	fetchImpl?: typeof fetch;
	now?: () => number;
	nonce?: () => string;
}): SegmentWriter {
	const fetchImpl = opts.fetchImpl ?? fetch;
	return async (payload) => {
		const req = await buildSignedSegmentRequest({
			apiUrl: opts.apiUrl,
			secret: opts.secret,
			payload,
			now: opts.now,
			nonce: opts.nonce,
		});
		const res = await fetchImpl(req.url, {
			method: "POST",
			headers: req.headers,
			body: req.body,
		});
		let id: string | null = null;
		try {
			const json = (await res.json()) as { id?: unknown };
			if (typeof json.id === "string") id = json.id;
		} catch {
			// No/!json body is fine — finals are fanned out regardless of persist.
		}
		return { status: res.status, ok: res.ok, id };
	};
}
