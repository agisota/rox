import { describe, expect, it } from "bun:test";
import { navItems } from "./navItems";

describe("agents header navItems", () => {
	it("exposes every cabinet destination (Workspaces + Pipelines + Board + Templates + Inbox + Calendar + Drive + Notes)", () => {
		expect(navItems).toHaveLength(10);
		const hrefs = navItems.map((item) => item.href);
		expect(hrefs).toEqual([
			"/agents",
			"/agents/workspaces",
			"/agents/pipelines",
			"/agents/board",
			"/agents/templates",
			"/inbox",
			"/calendar",
			"/integrations",
			"/drive",
			"/notes",
		]);
	});

	it("gives every nav item a non-empty label", () => {
		for (const item of navItems) {
			expect(item.label.length).toBeGreaterThan(0);
		}
	});
});
