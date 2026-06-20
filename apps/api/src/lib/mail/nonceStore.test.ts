import { describe, expect, test } from "bun:test";
import {
	createDbNonceStore,
	createInMemoryNonceStore,
	createLayeredNonceStore,
	type NonceDb,
} from "./nonceStore";

describe("createInMemoryNonceStore", () => {
	test("accepts a fresh nonce and rejects a replay", async () => {
		const store = createInMemoryNonceStore();
		expect(await store.checkAndRecord("a", 1000)).toBe(true);
		expect(await store.checkAndRecord("a", 1000)).toBe(false);
	});

	test("expires entries past the TTL window", async () => {
		const store = createInMemoryNonceStore(100);
		expect(await store.checkAndRecord("a", 0)).toBe(true);
		// Far outside the window: the entry was swept, so the nonce is fresh again.
		expect(await store.checkAndRecord("a", 10_000)).toBe(true);
	});
});

/**
 * A fake Drizzle insert builder modelling a UNIQUE primary key on `nonce`:
 * `onConflictDoNothing().returning()` resolves the inserted rows, or `[]` when
 * the nonce already existed (a replay).
 */
function makeFakeDb(): { db: NonceDb; pruned: Date[] } {
	const seen = new Set<string>();
	const pruned: Date[] = [];
	const db: NonceDb = {
		insert: (() => ({
			values: (row: { nonce: string }) => ({
				onConflictDoNothing: () => ({
					returning: async () => {
						if (seen.has(row.nonce)) return [];
						seen.add(row.nonce);
						return [{ nonce: row.nonce }];
					},
				}),
			}),
			// biome-ignore lint/suspicious/noExplicitAny: minimal fake builder
		})) as any,
		delete: (() => ({
			where: async (_cond: unknown) => {
				pruned.push(new Date());
			},
			// biome-ignore lint/suspicious/noExplicitAny: minimal fake builder
		})) as any,
	};
	return { db, pruned };
}

describe("createDbNonceStore", () => {
	test("accepts a fresh nonce (insert succeeds) and rejects a replay (conflict)", async () => {
		const { db } = makeFakeDb();
		const store = createDbNonceStore(db);
		expect(await store.checkAndRecord("n1", 1000)).toBe(true);
		// Same nonce again → unique conflict → empty returning → replay.
		expect(await store.checkAndRecord("n1", 2000)).toBe(false);
	});

	test("fails closed when the DB insert throws", async () => {
		const db: NonceDb = {
			insert: (() => ({
				values: () => ({
					onConflictDoNothing: () => ({
						returning: async () => {
							throw new Error("db down");
						},
					}),
				}),
				// biome-ignore lint/suspicious/noExplicitAny: minimal fake builder
			})) as any,
			// biome-ignore lint/suspicious/noExplicitAny: minimal fake builder
			delete: (() => ({ where: async () => {} })) as any,
		};
		const store = createDbNonceStore(db);
		// Cannot prove freshness ⇒ reject.
		expect(await store.checkAndRecord("n1")).toBe(false);
	});
});

describe("createLayeredNonceStore", () => {
	test("same-instance replay is rejected by the cache before the authority", async () => {
		let authorityCalls = 0;
		const authority = {
			checkAndRecord: async () => {
				authorityCalls += 1;
				return true;
			},
		};
		const store = createLayeredNonceStore(authority);
		expect(await store.checkAndRecord("n1", 1000)).toBe(true);
		// Second time: the in-memory cache short-circuits — authority not consulted.
		expect(await store.checkAndRecord("n1", 1000)).toBe(false);
		expect(authorityCalls).toBe(1);
	});

	test("a cross-instance replay is caught by the authoritative store", async () => {
		// The cache says fresh (this instance never saw it) but the authority knows.
		const authority = { checkAndRecord: async () => false };
		const store = createLayeredNonceStore(authority);
		expect(await store.checkAndRecord("from-other-instance", 1000)).toBe(false);
	});
});
