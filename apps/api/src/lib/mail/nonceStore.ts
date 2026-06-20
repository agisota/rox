/**
 * Short-TTL nonce replay guard for the inbound mail webhook (D3 §"replay guard").
 *
 * Each signed Worker POST carries a one-time nonce; a replayed request reuses it.
 * We remember seen nonces for the {@link MAX_SKEW_MS} window (the same window the
 * timestamp check enforces) so a captured-and-replayed request inside the window
 * is rejected even though its signature is still valid.
 *
 * In-memory by design for P0: the timestamp skew already bounds the replay window
 * to 5 minutes, so a process-local set is sufficient (a multi-instance deploy
 * would swap this for KV — the interface is the seam). Pure + injectable so the
 * route + tests share one contract.
 */

import { MAX_SKEW_MS } from "./verify";

export interface NonceStore {
	/** Record a nonce; returns false if it was already seen (a replay). */
	checkAndRecord(nonce: string, now?: number): boolean;
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
		checkAndRecord(nonce, now = Date.now()) {
			sweep(now);
			if (seen.has(nonce)) return false;
			seen.set(nonce, now);
			return true;
		},
	};
}

/** The shared singleton the route uses across requests. */
export const sharedNonceStore = createInMemoryNonceStore();
