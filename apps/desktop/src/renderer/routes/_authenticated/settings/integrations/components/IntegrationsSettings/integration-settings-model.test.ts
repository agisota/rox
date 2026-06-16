import { describe, expect, it } from "bun:test";
import { getIntegrationSettingsRows } from "./integration-settings-model";

describe("integration settings rows", () => {
	it("exposes all release-train providers in catalog order", () => {
		expect(getIntegrationSettingsRows().map((row) => row.provider)).toEqual([
			"linear",
			"github",
			"slack",
			"telegram",
			"discord",
			"notion",
			"obsidian",
			"fibery",
			"lark",
		]);
	});

	it("routes every provider to a manage path", () => {
		for (const row of getIntegrationSettingsRows()) {
			expect(row.managePath).toBe(`/integrations/${row.provider}`);
		}
	});
});
