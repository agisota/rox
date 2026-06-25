/**
 * Offline persistence queue — shared core (F50, Hermes-borrow #645).
 *
 * The PWA shell on web has to keep working with no network: prefs/collection
 * edits (F46) made while offline must survive a reload and replay in order once
 * connectivity returns. This module is the single, platform-agnostic core for
 * that — the same enqueue/flush logic and the same {@link PersistenceAdapter}
 * contract back every surface. Web supplies an IndexedDB adapter; desktop and
 * mobile (already "installed" natively) reuse the *pattern* against SQLite /
 * AsyncStorage for the same F46 collections.
 *
 * Why it lives in `@rox/shared` (and stays serializable): a queued patch is the
 * connective tissue between an offline edit and the eventual server reconcile.
 * To keep "an edit on phone replays the same as an edit in the browser" true,
 * the queued payload is plain JSON (the F46 patch shape) so it round-trips
 * through IndexedDB, SQLite, and AsyncStorage identically.
 *
 * The queue is intentionally minimal and storage-agnostic: it owns ordering,
 * monotonic ids, and a single in-flight flush; the adapter owns durability. A
 * patch only leaves the queue once its `send` resolves, so a flush interrupted
 * by a dropped connection leaves the un-acked patches in place to retry.
 */

import type { UserPreferencesPatch } from "./prefs";

// ---------------------------------------------------------------------------
// Persistence adapter contract (platform-agnostic)
// ---------------------------------------------------------------------------

/**
 * The minimal key/value durability contract every platform implements. Keys are
 * opaque strings; values are JSON-serializable. Web backs this with IndexedDB,
 * desktop with SQLite, mobile with AsyncStorage — the queue never assumes which.
 *
 * All methods are async so an IndexedDB transaction (the web case) fits without
 * forcing the others to fake synchrony.
 */
export interface PersistenceAdapter {
	/** Read a value, or `undefined` if the key is absent. */
	get<T>(key: string): Promise<T | undefined>;
	/** Write (overwrite) a value at `key`. */
	set<T>(key: string, value: T): Promise<void>;
	/** Delete `key`; a no-op if it is already absent. */
	delete(key: string): Promise<void>;
	/** List all keys, optionally restricted to those starting with `prefix`. */
	keys(prefix?: string): Promise<string[]>;
}

/**
 * In-memory {@link PersistenceAdapter}. Used for tests and as the SSR / no-IDB
 * fallback so the queue degrades to a session-only buffer instead of throwing
 * when `indexedDB` is unavailable (server render, private-mode Safari, etc.).
 */
export class MemoryPersistenceAdapter implements PersistenceAdapter {
	private readonly store = new Map<string, unknown>();

	get<T>(key: string): Promise<T | undefined> {
		return Promise.resolve(this.store.get(key) as T | undefined);
	}

	set<T>(key: string, value: T): Promise<void> {
		this.store.set(key, value);
		return Promise.resolve();
	}

	delete(key: string): Promise<void> {
		this.store.delete(key);
		return Promise.resolve();
	}

	keys(prefix?: string): Promise<string[]> {
		const all = [...this.store.keys()];
		return Promise.resolve(
			prefix ? all.filter((k) => k.startsWith(prefix)) : all,
		);
	}
}

// ---------------------------------------------------------------------------
// Queued entry shape (serializable)
// ---------------------------------------------------------------------------

/** Storage key prefix for queued prefs patches; namespaces the adapter. */
export const OFFLINE_QUEUE_PREFIX = "rox.offline-queue.prefs.";

/**
 * One queued, not-yet-acked prefs patch. `id` is a zero-padded monotonic
 * sequence so lexical key order equals enqueue order (IndexedDB and the
 * `keys()` listing both sort lexically). `queuedAt` is epoch millis for
 * diagnostics / future TTL eviction.
 */
export interface QueuedPrefsPatch {
	id: string;
	patch: UserPreferencesPatch;
	queuedAt: number;
}

/** Pad a sequence number so lexical order matches numeric order up to 1e12. */
function sequenceId(seq: number): string {
	return seq.toString().padStart(12, "0");
}

// ---------------------------------------------------------------------------
// Offline prefs queue
// ---------------------------------------------------------------------------

/**
 * Durable FIFO queue of offline prefs patches over a {@link PersistenceAdapter}.
 *
 * - {@link enqueue} stamps a monotonic id and persists the patch immediately, so
 *   a reload mid-offline keeps the edit.
 * - {@link flush} replays pending patches in order through `send`, deleting each
 *   only after its `send` resolves. A single flush runs at a time; a `send`
 *   rejection stops the flush and leaves that patch (and the rest) queued for a
 *   later retry — patches are never dropped on a transient failure.
 *
 * The queue derives its next sequence from the highest persisted id on first
 * use, so ids stay monotonic across reloads without a separate counter row.
 */
export class OfflinePrefsQueue {
	private nextSeq: number | null = null;
	private flushing: Promise<number> | null = null;

	constructor(private readonly adapter: PersistenceAdapter) {}

	/** Resolve the next monotonic sequence, seeding from persisted keys once. */
	private async reserveSeq(): Promise<number> {
		if (this.nextSeq === null) {
			const keys = await this.adapter.keys(OFFLINE_QUEUE_PREFIX);
			let max = -1;
			for (const key of keys) {
				const seq = Number.parseInt(key.slice(OFFLINE_QUEUE_PREFIX.length), 10);
				if (Number.isFinite(seq) && seq > max) max = seq;
			}
			this.nextSeq = max + 1;
		}
		const seq = this.nextSeq;
		this.nextSeq += 1;
		return seq;
	}

	/** Persist a patch at the tail of the queue and return its stable id. */
	async enqueue(patch: UserPreferencesPatch): Promise<QueuedPrefsPatch> {
		const seq = await this.reserveSeq();
		const entry: QueuedPrefsPatch = {
			id: sequenceId(seq),
			patch,
			queuedAt: Date.now(),
		};
		await this.adapter.set(`${OFFLINE_QUEUE_PREFIX}${entry.id}`, entry);
		return entry;
	}

	/** Return all pending patches in enqueue order. */
	async pending(): Promise<QueuedPrefsPatch[]> {
		const keys = (await this.adapter.keys(OFFLINE_QUEUE_PREFIX)).sort();
		const entries: QueuedPrefsPatch[] = [];
		for (const key of keys) {
			const entry = await this.adapter.get<QueuedPrefsPatch>(key);
			if (entry) entries.push(entry);
		}
		return entries;
	}

	/** Number of pending patches. */
	async size(): Promise<number> {
		return (await this.adapter.keys(OFFLINE_QUEUE_PREFIX)).length;
	}

	/**
	 * Replay pending patches in order through `send`, deleting each only after a
	 * successful send. Returns the number flushed. A rejected `send` stops the
	 * run early (the failing patch and all later ones stay queued); the rejection
	 * is not rethrown so a caller polling on reconnect can simply retry later.
	 *
	 * Concurrent calls share the in-flight run rather than double-sending.
	 */
	flush(send: (patch: UserPreferencesPatch) => Promise<void>): Promise<number> {
		if (this.flushing) return this.flushing;
		this.flushing = this.run(send).finally(() => {
			this.flushing = null;
		});
		return this.flushing;
	}

	private async run(
		send: (patch: UserPreferencesPatch) => Promise<void>,
	): Promise<number> {
		let sent = 0;
		for (const entry of await this.pending()) {
			try {
				await send(entry.patch);
			} catch {
				// Leave this and the remaining patches queued; preserve order so the
				// next flush retries from exactly here.
				break;
			}
			await this.adapter.delete(`${OFFLINE_QUEUE_PREFIX}${entry.id}`);
			sent += 1;
		}
		return sent;
	}
}
