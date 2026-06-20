import { describe, expect, it } from "bun:test";
import { navItems } from "./navItems";

describe("agents header navItems", () => {
	it("exposes the cabinet destinations including Drive (Workspaces + Pipelines reachable)", () => {
		expect(navItems).toHaveLength(5);
		const hrefs = navItems.map((item) => item.href);
		expect(hrefs).toEqual([
			"/agents",
			"/agents/workspaces",
			"/agents/pipelines",
			"/integrations",
			"/drive",
		]);
	});

	it("gives every nav item a non-empty label", () => {
		for (const item of navItems) {
			expect(item.label.length).toBeGreaterThan(0);
		}
	});
});
