import { describe, expect, it } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { governanceKindValues } from "./enums";
import { governanceKind, workspaceGovernanceItems } from "./governance";

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

describe("workspace_governance_items (#517)", () => {
	const cfg = getTableConfig(workspaceGovernanceItems);

	it("is named workspace_governance_items with the org/workspace/author spine", () => {
		expect(cfg.name).toBe("workspace_governance_items");
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("id");
		expect(cols).toContain("organization_id");
		expect(cols).toContain("v2_workspace_id");
		expect(cols).toContain("created_by");
		expect(cols).toContain("kind");
		expect(cols).toContain("text");
		expect(cols).toContain("order");
	});

	it("indexes organization_id and v2_workspace_id for the org/workspace shapes", () => {
		const names = indexNames(workspaceGovernanceItems);
		expect(names).toContain("workspace_governance_items_organization_idx");
		expect(names).toContain("workspace_governance_items_workspace_idx");
	});
});

describe("governance_kind enum", () => {
	it("exposes exactly goal/task/mission", () => {
		expect(governanceKind.enumValues).toEqual(["goal", "task", "mission"]);
		expect(governanceKindValues).toEqual(["goal", "task", "mission"]);
	});
});
