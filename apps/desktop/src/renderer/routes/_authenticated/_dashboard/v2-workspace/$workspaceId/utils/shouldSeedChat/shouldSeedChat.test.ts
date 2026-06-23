import { describe, expect, it } from "bun:test";
import { shouldSeedChat } from "./shouldSeedChat";

const EMPTY = { version: 1 as const, tabs: [], activeTabId: null };
const WITH_TAB = {
	version: 1 as const,
	tabs: [{ id: "t1", panes: [], activePaneId: null }],
	activeTabId: "t1",
};

describe("shouldSeedChat", () => {
	it("returns false when the layout is not yet known (null)", () => {
		expect(shouldSeedChat(null)).toBe(false);
	});

	it("returns false when the layout is undefined", () => {
		expect(shouldSeedChat(undefined)).toBe(false);
	});

	it("returns true for an empty hydrated layout (no tabs)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: minimal layout shape for test
		expect(shouldSeedChat(EMPTY as any)).toBe(true);
	});

	it("returns false when the layout already has a tab", () => {
		// biome-ignore lint/suspicious/noExplicitAny: minimal layout shape for test
		expect(shouldSeedChat(WITH_TAB as any)).toBe(false);
	});
});
