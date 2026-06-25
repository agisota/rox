import { describe, expect, it } from "bun:test";
import { parsePopoutParams, rehydratePane } from "./rehydratePaneLayout";

const layout = JSON.stringify({
	version: 1,
	activeTabId: "t1",
	tabs: [
		{
			id: "t1",
			panes: {
				pane1: { id: "pane1", kind: "chat", data: { sessionId: "s1" } },
				pane2: {
					id: "pane2",
					kind: "terminal",
					data: { terminalId: "term-7" },
				},
			},
		},
	],
});

describe("parsePopoutParams", () => {
	const make = (overrides: Record<string, string | null>) => {
		const base: Record<string, string | null> = {
			workspaceId: "ws1",
			paneId: "pane1",
			kind: "chat",
			paneLayout: "{}",
			...overrides,
		};
		return parsePopoutParams((k) => base[k] ?? null);
	};

	it("parses a complete, valid query", () => {
		expect(make({})).toEqual({
			workspaceId: "ws1",
			paneId: "pane1",
			kind: "chat",
			paneLayoutJson: "{}",
		});
	});

	it("rejects a missing required param", () => {
		expect(make({ workspaceId: null })).toBeNull();
		expect(make({ paneLayout: null })).toBeNull();
	});

	it("rejects an unknown pane kind", () => {
		expect(make({ kind: "sidebar" })).toBeNull();
	});
});

describe("rehydratePane", () => {
	it("finds a pane by id and returns its data", () => {
		expect(rehydratePane(layout, "pane2", "terminal")).toEqual({
			paneId: "pane2",
			kind: "terminal",
			data: { terminalId: "term-7" },
		});
	});

	it("returns null when the pane id is absent", () => {
		expect(rehydratePane(layout, "missing", "chat")).toBeNull();
	});

	it("returns null on malformed JSON instead of throwing", () => {
		expect(rehydratePane("{ not json", "pane1", "chat")).toBeNull();
	});

	it("tolerates a partial snapshot", () => {
		expect(rehydratePane("{}", "pane1", "chat")).toBeNull();
		expect(
			rehydratePane(JSON.stringify({ tabs: [{}] }), "pane1", "chat"),
		).toBeNull();
	});
});
