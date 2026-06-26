import { describe, expect, it } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { orgSettings, userPreferences } from "./preferences";

function indexNames(table: PgTable): string[] {
	const cfg = getTableConfig(table);
	const fromIndexes = cfg.indexes.map(
		(i) => (i as unknown as { config: { name?: string } }).config?.name,
	);
	const fromUniques = cfg.uniqueConstraints.map((u) => u.name);
	return [...fromIndexes, ...fromUniques].filter(
		(n): n is string => typeof n === "string",
	);
}

describe("user_preferences (F46)", () => {
	const cfg = getTableConfig(userPreferences);

	it("is named user_preferences with the org+user spine and jsonb values", () => {
		expect(cfg.name).toBe("user_preferences");
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("organization_id");
		expect(cols).toContain("created_by");
		expect(cols).toContain("values");
	});

	it("uniques (organization_id, created_by) for the upsert conflict target", () => {
		const names = indexNames(userPreferences);
		expect(names).toContain("user_preferences_org_user_unique");
		expect(names).toContain("user_preferences_org_idx");
	});
});

describe("org_settings (F46)", () => {
	const cfg = getTableConfig(orgSettings);

	it("is named org_settings with org spine and jsonb values", () => {
		expect(cfg.name).toBe("org_settings");
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("organization_id");
		expect(cols).toContain("values");
	});

	it("uniques organization_id (one settings row per org)", () => {
		const names = indexNames(orgSettings);
		expect(names).toContain("org_settings_org_unique");
	});
});
