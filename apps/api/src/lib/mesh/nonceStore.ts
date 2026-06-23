/**
 * Single-use nonce replay guard for the mesh relay-watcher ingress (D5).
 *
 * Each signed relay-watcher POST to `/api/mesh/inbound` carries a one-time nonce;
 * a replayed request reuses it. We reject any nonce we have already seen inside
 * the {@link MAX_SKEW_MS} window so a captured-and-replayed request is rejected
 * even though its signature is still valid.
 *
 * The DB is the source of truth: a nonce is consumed by an INSERT into
 * `mesh_nonces`, and an `onConflictDoNothing` that returns no row means the nonce
 * was already seen ⇒ replay. Replay protection therefore holds across
 * horizontally-scaled API instances. A per-process in-memory fast-path cache
 * short-circuits same-instance replays without a round-trip, but never serves as
 * the authority. Mirrors `lib/xmpp/nonceStore.ts` (D4).
 */

import { db as defaultDb } from "@rox/db/client";
import { meshNonces } from "@rox/db/schema";
import { lt } from "drizzle-orm";
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

/** The minimal Drizzle surface the DB-backed store needs (for injection/tests). */
export interface NonceDb {
	insert: typeof defaultDb.insert;
	delete: typeof defaultDb.delete;
}

/**
 * A DB-backed single-use nonce store. Replay protection holds across
 * horizontally-scaled instances because the unique primary key is the single
 * source of truth: the INSERT either records the row (fresh) or conflicts
 * (replay). Expired rows are pruned opportunistically (best-effort, on a sampled
 * fraction of calls so a hot path doesn't issue a DELETE every request).
 */
export function createDbNonceStore(
	db: NonceDb = defaultDb,
	ttlMs = MAX_SKEW_MS,
): NonceStore {
	async function prune(now: number): Promise<void> {
		try {
			await db
				.delete(meshNonces)
				.where(lt(meshNonces.expiresAt, new Date(now)));
		} catch {
			// Pruning is best-effort; never let it fail a request.
		}
	}

	return {
		async checkAndRecord(nonce, now = Date.now()) {
			const expiresAt = new Date(now + ttlMs);
			// Opportunistic prune (~2% of calls) so expired rows can't accumulate.
			if (Math.random() < 0.02) await prune(now);

			try {
				const inserted = await db
					.insert(meshNonces)
					.values({ nonce, expiresAt })
					// A conflicting (already-present) nonce inserts nothing.
					.onConflictDoNothing({ target: meshNonces.nonce })
					.returning({ nonce: meshNonces.nonce });
				// Empty result => the row already existed => replay.
				return inserted.length > 0;
			} catch {
				// Fail closed: if we cannot prove the nonce is fresh, reject it.
				return false;
			}
		},
	};
}

/**
 * Compose an in-memory fast-path in front of an authoritative store. A same-
 * instance replay is rejected immediately; otherwise the authoritative store
 * decides (and the result is mirrored into the cache).
 */
export function createLayeredNonceStore(
	authoritative: NonceStore,
	cache: NonceStore = createInMemoryNonceStore(),
): NonceStore {
	return {
		async checkAndRecord(nonce, now = Date.now()) {
			// Fast-path: a hit in the local cache is already a replay.
			const freshLocally = await cache.checkAndRecord(nonce, now);
			if (!freshLocally) return false;
			// Authoritative (cross-instance) check is the source of truth.
			return authoritative.checkAndRecord(nonce, now);
		},
	};
}

/**
 * The shared singleton the route uses across requests: the DB is authoritative,
 * with a per-process in-memory cache in front for same-instance fast rejection.
 */
export const sharedNonceStore: NonceStore = createLayeredNonceStore(
	createDbNonceStore(),
);
