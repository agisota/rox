import { describe, expect, it } from "bun:test";
import { isPopoutablePaneKind, toPopoutPaneKind } from "./popoutPaneKind";

describe("toPopoutPaneKind", () => {
	it("maps tear-off-able pane kinds, translating file -> file-tree", () => {
		expect(toPopoutPaneKind("chat")).toBe("chat");
		expect(toPopoutPaneKind("terminal")).toBe("terminal");
		expect(toPopoutPaneKind("file")).toBe("file-tree");
	});

	it("returns null for pane kinds that can't be popped out", () => {
		expect(toPopoutPaneKind("diff")).toBeNull();
		expect(toPopoutPaneKind("browser")).toBeNull();
		expect(toPopoutPaneKind("comment")).toBeNull();
		expect(toPopoutPaneKind("devtools")).toBeNull();
		expect(toPopoutPaneKind("unknown")).toBeNull();
	});

	it("isPopoutablePaneKind mirrors the mapping", () => {
		expect(isPopoutablePaneKind("chat")).toBe(true);
		expect(isPopoutablePaneKind("file")).toBe(true);
		expect(isPopoutablePaneKind("diff")).toBe(false);
	});
});
