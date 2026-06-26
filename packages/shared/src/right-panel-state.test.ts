import { describe, expect, it } from "bun:test";
import {
	createRightPanelStore,
	parseRightPanelState,
	RIGHT_PANEL_STATES,
	RIGHT_PANEL_STORAGE_KEY,
	type RightPanelStorage,
	rightPanelStateFromLegacyOpen,
} from "./right-panel-state";

function memoryStorage(seed: Record<string, string> = {}): RightPanelStorage & {
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

describe("parseRightPanelState", () => {
	it("accepts every valid state", () => {
		for (const state of RIGHT_PANEL_STATES) {
			expect(parseRightPanelState(state)).toBe(state);
		}
	});

	it("rejects unknown values", () => {
		expect(parseRightPanelState("open")).toBeNull();
		expect(parseRightPanelState(null)).toBeNull();
		expect(parseRightPanelState(42)).toBeNull();
		expect(parseRightPanelState(undefined)).toBeNull();
	});
});

describe("rightPanelStateFromLegacyOpen", () => {
	it("maps the legacy binary flag onto the 3-state machine", () => {
		expect(rightPanelStateFromLegacyOpen(true)).toBe("expanded");
		expect(rightPanelStateFromLegacyOpen(false)).toBe("hidden");
	});
});

describe("createRightPanelStore", () => {
	it("defaults to expanded with no storage", () => {
		const store = createRightPanelStore();
		expect(store.getSnapshot().state).toBe("expanded");
	});

	it("honors initialState when nothing is persisted", () => {
		const store = createRightPanelStore({ initialState: "peek" });
		expect(store.getSnapshot().state).toBe("peek");
	});

	it("hide/peek/expand/setState update the snapshot", () => {
		const store = createRightPanelStore();
		store.hide();
		expect(store.getSnapshot().state).toBe("hidden");
		store.peek();
		expect(store.getSnapshot().state).toBe("peek");
		store.expand();
		expect(store.getSnapshot().state).toBe("expanded");
		store.setState("hidden");
		expect(store.getSnapshot().state).toBe("hidden");
	});

	it("cycles hidden → peek → expanded → hidden", () => {
		const store = createRightPanelStore({ initialState: "hidden" });
		store.cycle();
		expect(store.getSnapshot().state).toBe("peek");
		store.cycle();
		expect(store.getSnapshot().state).toBe("expanded");
		store.cycle();
		expect(store.getSnapshot().state).toBe("hidden");
	});

	it("keeps a stable snapshot identity when value is unchanged", () => {
		const store = createRightPanelStore();
		const first = store.getSnapshot();
		store.expand(); // already expanded — no-op
		expect(store.getSnapshot()).toBe(first);
		store.hide();
		expect(store.getSnapshot()).not.toBe(first);
	});

	it("notifies subscribers only on real changes", () => {
		const store = createRightPanelStore();
		let calls = 0;
		const unsub = store.subscribe(() => {
			calls += 1;
		});
		store.hide();
		store.hide(); // idempotent
		store.peek();
		expect(calls).toBe(2);
		unsub();
		store.expand();
		expect(calls).toBe(2);
	});

	it("hydrates from persisted storage", () => {
		const storage = memoryStorage({
			[RIGHT_PANEL_STORAGE_KEY]: JSON.stringify({ state: "peek" }),
		});
		const store = createRightPanelStore({ storage });
		expect(store.getSnapshot().state).toBe("peek");
	});

	it("persists changes back to storage as plain JSON", () => {
		const storage = memoryStorage();
		const store = createRightPanelStore({ storage });
		store.peek();
		expect(JSON.parse(storage.dump()[RIGHT_PANEL_STORAGE_KEY] ?? "{}")).toEqual(
			{
				state: "peek",
			},
		);
		store.hide();
		expect(JSON.parse(storage.dump()[RIGHT_PANEL_STORAGE_KEY] ?? "{}")).toEqual(
			{
				state: "hidden",
			},
		);
	});

	it("falls back to default on corrupt persisted data", () => {
		const storage = memoryStorage({ [RIGHT_PANEL_STORAGE_KEY]: "not json" });
		const store = createRightPanelStore({ storage, initialState: "peek" });
		expect(store.getSnapshot().state).toBe("peek");
	});

	it("falls back to default on an unknown persisted state", () => {
		const storage = memoryStorage({
			[RIGHT_PANEL_STORAGE_KEY]: JSON.stringify({ state: "open" }),
		});
		const store = createRightPanelStore({ storage, initialState: "expanded" });
		expect(store.getSnapshot().state).toBe("expanded");
	});

	it("survives a throwing storage backend", () => {
		const throwing: RightPanelStorage = {
			getItem: () => {
				throw new Error("denied");
			},
			setItem: () => {
				throw new Error("denied");
			},
		};
		const store = createRightPanelStore({ storage: throwing });
		expect(store.getSnapshot().state).toBe("expanded");
		expect(() => store.hide()).not.toThrow();
		expect(store.getSnapshot().state).toBe("hidden");
	});
});
