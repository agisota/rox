/**
 * Single-use nonce replay guard for the inbound mail webhook (D3 §"replay
 * guard").
 *
 * Each signed Worker POST carries a one-time nonce; a replayed request reuses
 * it. We reject any nonce we have already seen inside the {@link MAX_SKEW_MS}
 * window (the same window the timestamp check enforces) so a captured-and-
 * replayed request is rejected even though its signature is still valid.
 *
 * SECURITY (PR #335 review, Fix #3): an in-memory `Map` is per-process, so on a
 * horizontally-scaled API a replay routed to a DIFFERENT instance would not be
 * caught. The DB is therefore the source of truth: a nonce is consumed by an
 * INSERT into `mail_nonces`, and a unique-constraint (primary-key) violation
 * means the nonce was already seen ⇒ replay. An in-memory fast-path cache short-
 * circuits same-instance replays without a round-trip, but never serves as the
 * authority. Expired rows are pruned opportunistically.
 *
 * The store is pluggable behind {@link NonceStore} so the route + tests share one
 * contract and tests can run with the pure in-memory implementation.
 */

import { db as defaultDb } from "@rox/db/client";
import { mailNonces } from "@rox/db/schema";
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
 * horizontally-scaled instances because the DB primary key is the single source
 * of truth: the INSERT either succeeds (fresh) or violates the unique constraint
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
				.delete(mailNonces)
				.where(lt(mailNonces.expiresAt, new Date(now)));
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
					.insert(mailNonces)
					.values({ nonce, expiresAt })
					// A conflicting (already-present) nonce inserts nothing.
					.onConflictDoNothing({ target: mailNonces.nonce })
					.returning({ nonce: mailNonces.nonce });
				// Empty result ⇒ the row already existed ⇒ replay.
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
