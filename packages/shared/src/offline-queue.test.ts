import { describe, expect, it } from "bun:test";

import {
	MemoryPersistenceAdapter,
	OFFLINE_QUEUE_PREFIX,
	OfflinePrefsQueue,
	type PersistenceAdapter,
} from "./offline-queue";
import type { UserPreferencesPatch } from "./prefs";

function patch(locale: string): UserPreferencesPatch {
	return { locale };
}

describe("MemoryPersistenceAdapter", () => {
	it("round-trips values and filters keys by prefix", async () => {
		const a = new MemoryPersistenceAdapter();
		await a.set("rox.a", 1);
		await a.set("rox.b", 2);
		await a.set("other", 3);
		expect(await a.get<number>("rox.a")).toBe(1);
		expect(await a.get("missing")).toBeUndefined();
		expect((await a.keys("rox.")).sort()).toEqual(["rox.a", "rox.b"]);
		await a.delete("rox.a");
		expect(await a.get("rox.a")).toBeUndefined();
	});
});

describe("OfflinePrefsQueue", () => {
	it("persists patches and reports them in enqueue order", async () => {
		const queue = new OfflinePrefsQueue(new MemoryPersistenceAdapter());
		await queue.enqueue(patch("ru"));
		await queue.enqueue(patch("en"));
		const pending = await queue.pending();
		expect(pending.map((p) => p.patch.locale)).toEqual(["ru", "en"]);
		expect(await queue.size()).toBe(2);
	});

	it("assigns monotonic, lexically-sortable ids", async () => {
		const queue = new OfflinePrefsQueue(new MemoryPersistenceAdapter());
		const first = await queue.enqueue(patch("a"));
		const second = await queue.enqueue(patch("b"));
		expect(first.id < second.id).toBe(true);
		expect(first.id).toMatch(/^\d{12}$/);
	});

	it("flushes pending patches in order and clears them", async () => {
		const queue = new OfflinePrefsQueue(new MemoryPersistenceAdapter());
		await queue.enqueue(patch("ru"));
		await queue.enqueue(patch("en"));
		const seen: string[] = [];
		const sent = await queue.flush(async (p) => {
			seen.push(p.locale ?? "");
		});
		expect(sent).toBe(2);
		expect(seen).toEqual(["ru", "en"]);
		expect(await queue.size()).toBe(0);
	});

	it("stops on a failing send and preserves the remaining queue and order", async () => {
		const queue = new OfflinePrefsQueue(new MemoryPersistenceAdapter());
		await queue.enqueue(patch("ru"));
		await queue.enqueue(patch("en"));
		await queue.enqueue(patch("de"));

		let calls = 0;
		const sent = await queue.flush(async () => {
			calls += 1;
			if (calls === 2) throw new Error("offline");
		});
		// First succeeds (deleted), second fails (kept) → ru drained, en+de remain.
		expect(sent).toBe(1);
		const remaining = await queue.pending();
		expect(remaining.map((p) => p.patch.locale)).toEqual(["en", "de"]);

		// A retry once "online" drains the rest in original order.
		const seen: string[] = [];
		const sent2 = await queue.flush(async (p) => {
			seen.push(p.locale ?? "");
		});
		expect(sent2).toBe(2);
		expect(seen).toEqual(["en", "de"]);
		expect(await queue.size()).toBe(0);
	});

	it("keeps ids monotonic across a fresh queue over the same adapter (reload)", async () => {
		const adapter = new MemoryPersistenceAdapter();
		const first = new OfflinePrefsQueue(adapter);
		const a = await first.enqueue(patch("ru"));

		// Simulate a page reload: a brand-new queue instance, same durable store.
		const reloaded = new OfflinePrefsQueue(adapter);
		const b = await reloaded.enqueue(patch("en"));
		expect(b.id > a.id).toBe(true);
		expect((await reloaded.pending()).map((p) => p.patch.locale)).toEqual([
			"ru",
			"en",
		]);
	});

	it("coalesces concurrent flushes into one run", async () => {
		const queue = new OfflinePrefsQueue(new MemoryPersistenceAdapter());
		await queue.enqueue(patch("ru"));
		let calls = 0;
		const send = async () => {
			calls += 1;
			await new Promise((r) => setTimeout(r, 5));
		};
		const [a, b] = await Promise.all([queue.flush(send), queue.flush(send)]);
		// Both callers observe the same single run; the patch is sent once.
		expect(calls).toBe(1);
		expect(a).toBe(b);
	});

	it("namespaces its keys under the queue prefix", async () => {
		const adapter: PersistenceAdapter = new MemoryPersistenceAdapter();
		const queue = new OfflinePrefsQueue(adapter);
		await queue.enqueue(patch("ru"));
		const keys = await adapter.keys();
		expect(keys.every((k) => k.startsWith(OFFLINE_QUEUE_PREFIX))).toBe(true);
	});
});
