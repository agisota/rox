import { describe, expect, it } from "bun:test";
import { isPopoutPaneKind, popoutWindowId } from "./popout";

describe("popout shared contract", () => {
	it("validates pane kinds", () => {
		expect(isPopoutPaneKind("chat")).toBe(true);
		expect(isPopoutPaneKind("file-tree")).toBe(true);
		expect(isPopoutPaneKind("terminal")).toBe(true);
		expect(isPopoutPaneKind("sidebar")).toBe(false);
		expect(isPopoutPaneKind(null)).toBe(false);
	});

	it("derives a stable, unique popout id per workspace+pane", () => {
		expect(popoutWindowId("ws1", "p1")).toBe("popout:ws1:p1");
		expect(popoutWindowId("ws1", "p1")).toBe(popoutWindowId("ws1", "p1"));
		expect(popoutWindowId("ws1", "p1")).not.toBe(popoutWindowId("ws1", "p2"));
	});
});
