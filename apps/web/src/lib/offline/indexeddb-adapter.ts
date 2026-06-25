/**
 * Web IndexedDB persistence adapter (F50, Hermes-borrow #645).
 *
 * Implements the cross-platform {@link PersistenceAdapter} contract from
 * `@rox/shared/offline-queue` using the browser's native IndexedDB — no extra
 * dependency. This is the web backing store for the F46 offline prefs/collection
 * queue: edits made with no network are durable here and replay on reconnect.
 *
 * A single object store (`kv`) keyed by string holds JSON values. When IndexedDB
 * is unavailable (SSR, private-mode Safari, disabled storage) the queue falls
 * back to `MemoryPersistenceAdapter` via {@link createOfflineAdapter}, so the app
 * degrades to a session-only buffer instead of throwing.
 */

import {
	MemoryPersistenceAdapter,
	type PersistenceAdapter,
} from "@rox/shared/offline-queue";

const DB_NAME = "rox-offline";
const DB_VERSION = 1;
const STORE = "kv";

/** Wrap an IDBRequest in a promise. */
function promisify<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/** Open (and lazily create) the offline KV database. */
function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/** Native-IndexedDB implementation of the shared persistence contract. */
export class IndexedDbPersistenceAdapter implements PersistenceAdapter {
	private dbPromise: Promise<IDBDatabase> | null = null;

	private db(): Promise<IDBDatabase> {
		this.dbPromise ??= openDb();
		return this.dbPromise;
	}

	private async tx<T>(
		mode: IDBTransactionMode,
		run: (store: IDBObjectStore) => IDBRequest<T>,
	): Promise<T> {
		const db = await this.db();
		const store = db.transaction(STORE, mode).objectStore(STORE);
		return promisify(run(store));
	}

	async get<T>(key: string): Promise<T | undefined> {
		const value = await this.tx<unknown>("readonly", (s) => s.get(key));
		return value as T | undefined;
	}

	async set<T>(key: string, value: T): Promise<void> {
		await this.tx("readwrite", (s) => s.put(value as unknown, key));
	}

	async delete(key: string): Promise<void> {
		await this.tx("readwrite", (s) => s.delete(key));
	}

	async keys(prefix?: string): Promise<string[]> {
		const allKeys = await this.tx<IDBValidKey[]>("readonly", (s) =>
			s.getAllKeys(),
		);
		const strings = allKeys.filter((k): k is string => typeof k === "string");
		return prefix ? strings.filter((k) => k.startsWith(prefix)) : strings;
	}
}

/** True when a usable IndexedDB is present (browser, not SSR). */
function hasIndexedDb(): boolean {
	return typeof indexedDB !== "undefined";
}

/**
 * Return the best available adapter for the current environment: IndexedDB in
 * the browser, an in-memory fallback during SSR or where storage is blocked.
 */
export function createOfflineAdapter(): PersistenceAdapter {
	return hasIndexedDb()
		? new IndexedDbPersistenceAdapter()
		: new MemoryPersistenceAdapter();
}
