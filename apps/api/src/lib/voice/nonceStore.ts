/**
 * Single-use nonce replay guard for the transcribe-worker ingress (Live STT
 * Phase-2). Each signed worker POST to `POST /api/voice/segment` carries a
 * one-time nonce; a replayed request reuses it. We reject any nonce already seen
 * inside the {@link MAX_SKEW_MS} window so a captured-and-replayed request is
 * rejected even though its signature is still valid.
 *
 * Mirrors the REPLAY CONTRACT of `lib/mesh/nonceStore.ts` (D5) — same
 * `checkAndRecord(nonce) => false on replay` interface the route consumes.
 *
 * STORE CHOICE / SCOPE HONESTY: the mesh path is backed by a `mesh_nonces` table
 * so its replay guard holds across horizontally-scaled API instances. This route
 * adds NO migration (the `live_transcript_segments` table already exists; a
 * transcript-nonce table is intentionally out of scope here), so the guard is a
 * per-process in-memory store: it rejects same-instance replays within the skew
 * window. The signed TIMESTAMP skew already caps any replay to a 5-minute window;
 * promoting this to a DB-backed cross-instance store (a `transcript_nonces` table
 * mirroring `mesh_nonces`) is the documented deploy follow-up, exactly as the
 * worker's `segment-writer.ts` already records the route itself as deploy-gated.
 */

import { MAX_SKEW_MS } from "./verify";

export interface NonceStore {
	/**
	 * Record a nonce; resolves `false` if it was already seen (a replay), `true`
	 * if it is fresh and was recorded.
	 */
	checkAndRecord(nonce: string, now?: number): Promise<boolean>;
}

/** A process-local nonce store that expires entries after the skew window. */
export function createInMemoryNonceStore(ttlMs = MAX_SKEW_MS): NonceStore {
	const seen = new Map<string, number>();

	function sweep(now: number): void {
		for (const [nonce, ts] of seen) {
			if (now - ts > ttlMs) seen.delete(nonce);
		}
	}

	return {
		async checkAndRecord(nonce, now = Date.now()) {
			sweep(now);
			if (seen.has(nonce)) return false;
			seen.set(nonce, now);
			return true;
		},
	};
}

/**
 * The shared singleton the route uses across requests. In-memory (see the store-
 * choice note above): authoritative for same-instance replays inside the skew
 * window.
 */
export const sharedSegmentNonceStore: NonceStore = createInMemoryNonceStore();
