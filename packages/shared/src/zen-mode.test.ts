import { describe, expect, it } from "bun:test";
import {
	createZenModeStore,
	ZEN_MODE_STORAGE_KEY,
	type ZenModeStorage,
} from "./zen-mode";

function memoryStorage(seed: Record<string, string> = {}): ZenModeStorage & {
	dump: () => Record<string, string>;
} {
	const map = new Map<string, string>(Object.entries(seed));
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => {
			map.set(key, value);
		},
		dump: () => Object.fromEntries(map),
	};
}

describe("createZenModeStore", () => {
	it("defaults to inactive with no storage", () => {
		const store = createZenModeStore();
		expect(store.getSnapshot().active).toBe(false);
	});

	it("honors initialActive when nothing is persisted", () => {
		const store = createZenModeStore({ initialActive: true });
		expect(store.getSnapshot().active).toBe(true);
	});

	it("enter/exit/toggle update the snapshot", () => {
		const store = createZenModeStore();
		store.enter();
		expect(store.getSnapshot().active).toBe(true);
		store.exit();
		expect(store.getSnapshot().active).toBe(false);
		store.toggle();
		expect(store.getSnapshot().active).toBe(true);
		store.toggle();
		expect(store.getSnapshot().active).toBe(false);
	});

	it("keeps a stable snapshot identity when value is unchanged", () => {
		const store = createZenModeStore();
		const first = store.getSnapshot();
		store.exit(); // already inactive — no-op
		expect(store.getSnapshot()).toBe(first);
		store.enter();
		expect(store.getSnapshot()).not.toBe(first);
	});

	it("notifies subscribers only on real changes", () => {
		const store = createZenModeStore();
		let calls = 0;
		const unsub = store.subscribe(() => {
			calls += 1;
		});
		store.enter();
		store.enter(); // idempotent
		store.exit();
		expect(calls).toBe(2);
		unsub();
		store.toggle();
		expect(calls).toBe(2);
	});

	it("hydrates from persisted storage", () => {
		const storage = memoryStorage({
			[ZEN_MODE_STORAGE_KEY]: JSON.stringify({ active: true }),
		});
		const store = createZenModeStore({ storage });
		expect(store.getSnapshot().active).toBe(true);
	});

	it("persists changes back to storage as plain JSON", () => {
		const storage = memoryStorage();
		const store = createZenModeStore({ storage });
		store.enter();
		expect(JSON.parse(storage.dump()[ZEN_MODE_STORAGE_KEY] ?? "{}")).toEqual({
			active: true,
		});
		store.exit();
		expect(JSON.parse(storage.dump()[ZEN_MODE_STORAGE_KEY] ?? "{}")).toEqual({
			active: false,
		});
	});

	it("falls back to default on corrupt persisted data", () => {
		const storage = memoryStorage({ [ZEN_MODE_STORAGE_KEY]: "not json" });
		const store = createZenModeStore({ storage, initialActive: false });
		expect(store.getSnapshot().active).toBe(false);
	});

	it("survives a throwing storage backend", () => {
		const throwing: ZenModeStorage = {
			getItem: () => {
				throw new Error("denied");
			},
			setItem: () => {
				throw new Error("denied");
			},
		};
		const store = createZenModeStore({ storage: throwing });
		expect(store.getSnapshot().active).toBe(false);
		// Must not throw despite the failing backend.
		expect(() => store.enter()).not.toThrow();
		expect(store.getSnapshot().active).toBe(true);
	});
});
