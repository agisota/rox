import { describe, expect, it } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import { userFeatureFlags } from "./feature-flags";

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

function column(table: PgTable, name: string) {
	return getTableConfig(table).columns.find((c) => c.name === name);
}

describe("user_feature_flags (WS-O T4)", () => {
	const cfg = getTableConfig(userFeatureFlags);

	it("is named user_feature_flags", () => {
		expect(cfg.name).toBe("user_feature_flags");
	});

	it("has user_id / key / value / updated_by / updated_at", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("user_id");
		expect(cols).toContain("key");
		expect(cols).toContain("value");
		expect(cols).toContain("updated_by");
		expect(cols).toContain("updated_at");
	});

	it("value is a non-null boolean (force-on/force-off; row absence = inherit)", () => {
		const value = column(userFeatureFlags, "value");
		expect(value?.notNull).toBe(true);
		expect(value?.getSQLType()).toBe("boolean");
	});

	it("updated_by is nullable (set-null)", () => {
		expect(column(userFeatureFlags, "updated_by")?.notNull).toBe(false);
	});

	it("uniques (user_id, key) + indexes user_id", () => {
		const names = indexNames(userFeatureFlags);
		expect(names).toContain("user_feature_flags_user_key_unique");
		expect(names).toContain("user_feature_flags_user_idx");
	});
});
