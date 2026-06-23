/**
 * Sign + POST an unwrapped mesh event to the rox API ingress.
 *
 * The watcher is the trusted bridge; it authenticates to `/api/mesh/inbound`
 * exactly like the D4 XMPP bridge: HMAC-SHA256 over the raw JSON body with the
 * shared `MESH_INBOUND_SECRET`, plus a timestamp and a single-use nonce. This
 * mirrors `apps/api/src/lib/mesh/verify.ts` (the server side that validates it) —
 * same header names, same hex-HMAC encoding — so the two stay in lockstep.
 *
 * Pure transport: `fetch` and `crypto` are injectable so this unit-tests the
 * signed-envelope shape (headers + body) without a live API.
 */

import { webcrypto } from "node:crypto";
import type { RelayWatcherOutboundEvent } from "./contract";

export const MESH_SIGNATURE_HEADER = "x-rox-mesh-signature";
export const MESH_TIMESTAMP_HEADER = "x-rox-mesh-timestamp";
export const MESH_NONCE_HEADER = "x-rox-mesh-nonce";

/** Use the platform Web Crypto (Node 18+/Bun expose `crypto.subtle`). */
const cryptoImpl: Crypto =
	(globalThis.crypto as Crypto | undefined) ?? (webcrypto as unknown as Crypto);

function toHex(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let out = "";
	for (const b of bytes) out += b.toString(16).padStart(2, "0");
	return out;
}

/** Compute `hex(HMAC-SHA256(secret, body))` — identical to the server verify. */
export async function computeMeshSignature(
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

export interface SignedMeshRequest {
	url: string;
	body: string;
	headers: Record<string, string>;
}

export interface BuildSignedRequestOptions {
	apiUrl: string;
	secret: string;
	event: RelayWatcherOutboundEvent;
	now?: () => number;
	nonce?: () => string;
	subtle?: SubtleCrypto;
}

/**
 * Build the signed request (url + body + the three auth headers) for one event.
 * Split from the network call so the signing contract is unit-testable and the
 * caller can retry/transport however it likes.
 */
export async function buildSignedMeshRequest(
	opts: BuildSignedRequestOptions,
): Promise<SignedMeshRequest> {
	const now = opts.now ?? Date.now;
	const nonceFn = opts.nonce ?? (() => cryptoImpl.randomUUID());

	// The HMAC is over the EXACT bytes the server reads, so serialize once.
	const body = JSON.stringify(opts.event);
	const timestamp = String(now());
	const nonce = nonceFn();
	const signature = await computeMeshSignature(opts.secret, body, opts.subtle);

	const base = opts.apiUrl.replace(/\/+$/, "");
	return {
		url: `${base}/api/mesh/inbound`,
		body,
		headers: {
			"content-type": "application/json",
			[MESH_SIGNATURE_HEADER]: signature,
			[MESH_TIMESTAMP_HEADER]: timestamp,
			[MESH_NONCE_HEADER]: nonce,
		},
	};
}

export interface PostResult {
	status: number;
	ok: boolean;
}

/**
 * Sign + POST one unwrapped event. Returns the HTTP status so the loop can log
 * (200 accepted / 409 duplicate / 4xx rejected) without throwing on the expected
 * dedup path. `fetchImpl` is injectable for tests.
 */
export async function postInboundMesh(
	opts: BuildSignedRequestOptions & { fetchImpl?: typeof fetch },
): Promise<PostResult> {
	const req = await buildSignedMeshRequest(opts);
	const fetchImpl = opts.fetchImpl ?? fetch;
	const res = await fetchImpl(req.url, {
		method: "POST",
		headers: req.headers,
		body: req.body,
	});
	return { status: res.status, ok: res.ok };
}
