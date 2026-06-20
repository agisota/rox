import { describe, expect, it } from "bun:test";
import type { MosaicNode } from "react-mosaic-component";
import type { Pane, Tab, TabsState } from "../types";
import { deriveTabName, findNextTab, withDerivedTabNames } from "./close-tab";

const WORKSPACE_ID = "ws-1";

function createTab(id: string, layout: MosaicNode<string>, name = id): Tab {
	return {
		id,
		name,
		workspaceId: WORKSPACE_ID,
		layout,
		createdAt: 0,
	};
}

function createPane(id: string, tabId: string, name = id): Pane {
	return {
		id,
		tabId,
		type: "terminal",
		name,
	};
}

function createState(overrides: Partial<TabsState> = {}): TabsState {
	return {
		tabs: [],
		panes: {},
		activeTabIds: {},
		focusedPaneIds: {},
		tabHistoryStacks: {},
		closedTabsStack: [],
		...overrides,
	};
}

describe("findNextTab", () => {
	it("returns null when the tab to close does not exist", () => {
		const state = createState({
			tabs: [createTab("tab-a", "pane-a")],
		});
		expect(findNextTab(state, "missing")).toBeNull();
	});

	it("returns null when there are no other tabs in the workspace", () => {
		const state = createState({
			tabs: [createTab("tab-a", "pane-a")],
		});
		expect(findNextTab(state, "tab-a")).toBeNull();
	});

	it("prefers the most recently used tab from the history stack", () => {
		const state = createState({
			tabs: [
				createTab("tab-a", "pane-a"),
				createTab("tab-b", "pane-b"),
				createTab("tab-c", "pane-c"),
			],
			tabHistoryStacks: { [WORKSPACE_ID]: ["tab-c", "tab-b"] },
		});
		// Closing tab-a; history top is tab-c (still present) -> pick it.
		expect(findNextTab(state, "tab-a")).toBe("tab-c");
	});

	it("skips the closing tab and stale ids in the history stack", () => {
		const state = createState({
			tabs: [
				createTab("tab-a", "pane-a"),
				createTab("tab-b", "pane-b"),
				createTab("tab-c", "pane-c"),
			],
			// tab-a is being closed; "ghost" no longer exists; tab-b is the first valid.
			tabHistoryStacks: { [WORKSPACE_ID]: ["tab-a", "ghost", "tab-b"] },
		});
		expect(findNextTab(state, "tab-a")).toBe("tab-b");
	});

	it("falls back to the positional next neighbor when history is empty", () => {
		const state = createState({
			tabs: [
				createTab("tab-a", "pane-a"),
				createTab("tab-b", "pane-b"),
				createTab("tab-c", "pane-c"),
			],
			tabHistoryStacks: { [WORKSPACE_ID]: [] },
		});
		// Closing tab-b -> next is tab-c.
		expect(findNextTab(state, "tab-b")).toBe("tab-c");
	});

	it("falls back to the positional previous neighbor for the last tab", () => {
		const state = createState({
			tabs: [
				createTab("tab-a", "pane-a"),
				createTab("tab-b", "pane-b"),
				createTab("tab-c", "pane-c"),
			],
			tabHistoryStacks: { [WORKSPACE_ID]: [] },
		});
		// Closing tab-c (last) -> no next, so previous tab-b.
		expect(findNextTab(state, "tab-c")).toBe("tab-b");
	});

	it("ignores history entries belonging to other workspaces", () => {
		const otherWorkspaceTab: Tab = {
			...createTab("tab-other", "pane-other"),
			workspaceId: "ws-2",
		};
		const state = createState({
			tabs: [
				createTab("tab-a", "pane-a"),
				createTab("tab-b", "pane-b"),
				otherWorkspaceTab,
			],
			// History points at a tab in a different workspace; must not be picked.
			tabHistoryStacks: { [WORKSPACE_ID]: ["tab-other", "tab-b"] },
		});
		expect(findNextTab(state, "tab-a")).toBe("tab-b");
	});

	it("falls back to the first available workspace tab as a last resort", () => {
		const state = createState({
			tabs: [createTab("tab-a", "pane-a"), createTab("tab-b", "pane-b")],
			tabHistoryStacks: { [WORKSPACE_ID]: [] },
		});
		// Closing tab-a: no next-after-self positional? tab-a is index 0, next is tab-b.
		expect(findNextTab(state, "tab-a")).toBe("tab-b");
	});
});

describe("deriveTabName", () => {
	it("uses the single pane's name when a tab has exactly one pane", () => {
		const panes = {
			"pane-a": createPane("pane-a", "tab-a", "README.md"),
		};
		expect(deriveTabName(panes, "tab-a")).toBe("README.md");
	});

	it("returns a count label when a tab has multiple panes", () => {
		const panes = {
			"pane-a": createPane("pane-a", "tab-a", "a"),
			"pane-b": createPane("pane-b", "tab-a", "b"),
			"pane-c": createPane("pane-c", "tab-a", "c"),
		};
		expect(deriveTabName(panes, "tab-a")).toBe("Multiple panes (3)");
	});

	it("only counts panes belonging to the given tab", () => {
		const panes = {
			"pane-a": createPane("pane-a", "tab-a", "a"),
			"pane-b": createPane("pane-b", "tab-other", "b"),
		};
		expect(deriveTabName(panes, "tab-a")).toBe("a");
	});

	it("returns the zero-pane label when no panes match", () => {
		const panes = {
			"pane-a": createPane("pane-a", "tab-other", "a"),
		};
		expect(deriveTabName(panes, "tab-a")).toBe("Multiple panes (0)");
	});
});

describe("withDerivedTabNames", () => {
	const baseState = () => ({
		tabs: [
			createTab("tab-a", "pane-a", "old-a"),
			createTab("tab-b", "pane-b", "old-b"),
		],
		panes: {
			"pane-a": createPane("pane-a", "tab-a", "fresh-a"),
			"pane-b1": createPane("pane-b1", "tab-b", "b1"),
			"pane-b2": createPane("pane-b2", "tab-b", "b2"),
		} as Record<string, Pane>,
		activeTabIds: { [WORKSPACE_ID]: "tab-a" },
		focusedPaneIds: {},
		tabHistoryStacks: { [WORKSPACE_ID]: [] },
	});

	it("returns the same state reference when no tab ids are supplied", () => {
		const state = baseState();
		expect(withDerivedTabNames(state, [])).toBe(state);
	});

	it("returns the same state reference when all tab ids are undefined", () => {
		const state = baseState();
		expect(withDerivedTabNames(state, [undefined, undefined])).toBe(state);
	});

	it("re-derives names only for affected tabs", () => {
		const state = baseState();
		const next = withDerivedTabNames(state, ["tab-a"]);

		expect(next).not.toBe(state);
		const tabA = next.tabs.find((t) => t.id === "tab-a");
		const tabB = next.tabs.find((t) => t.id === "tab-b");
		// tab-a recomputed from its single pane name.
		expect(tabA?.name).toBe("fresh-a");
		// tab-b untouched (kept original name).
		expect(tabB?.name).toBe("old-b");
	});

	it("derives a multi-pane label for affected multi-pane tabs", () => {
		const state = baseState();
		const next = withDerivedTabNames(state, ["tab-b"]);
		const tabB = next.tabs.find((t) => t.id === "tab-b");
		expect(tabB?.name).toBe("Multiple panes (2)");
	});

	it("ignores undefined entries while still processing valid tab ids", () => {
		const state = baseState();
		const next = withDerivedTabNames(state, [undefined, "tab-a"]);
		expect(next).not.toBe(state);
		expect(next.tabs.find((t) => t.id === "tab-a")?.name).toBe("fresh-a");
	});
});
