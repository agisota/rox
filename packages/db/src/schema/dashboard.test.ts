import { describe, expect, it } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { dashboardEntries, dashboardSections, dashboards } from "./dashboard";
import { dashboardSectionKindValues } from "./enums";

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

describe("dashboards (WS-O T3)", () => {
	const cfg = getTableConfig(dashboards);

	it("is named dashboards with the org spine", () => {
		expect(cfg.name).toBe("dashboards");
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("organization_id");
		expect(cols).toContain("v2_project_id");
		expect(cols).toContain("slug");
		expect(cols).toContain("name");
		expect(cols).toContain("created_by_user_id");
	});

	it("uniques (org_id, slug) + indexes org_id", () => {
		const names = indexNames(dashboards);
		expect(names).toContain("dashboards_org_slug_unique");
		expect(names).toContain("dashboards_org_idx");
	});
});

describe("dashboard_sections (WS-O T3)", () => {
	const cfg = getTableConfig(dashboardSections);

	it("is named dashboard_sections with denormalized organization_id", () => {
		expect(cfg.name).toBe("dashboard_sections");
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("dashboard_id");
		expect(cols).toContain("organization_id");
		expect(cols).toContain("kind");
		expect(cols).toContain("title");
		expect(cols).toContain("position");
	});

	it("kind column is wired to the dashboard_section_kind enum", () => {
		const kind = column(dashboardSections, "kind");
		expect(kind?.enumValues).toEqual([...dashboardSectionKindValues]);
	});

	it("indexes the denormalized organization_id + dashboard_id", () => {
		const names = indexNames(dashboardSections);
		expect(names).toContain("dashboard_sections_org_idx");
		expect(names).toContain("dashboard_sections_dashboard_idx");
	});
});

describe("dashboard_entries (WS-O T3)", () => {
	const cfg = getTableConfig(dashboardEntries);

	it("is named dashboard_entries with denormalized org + dashboard ids", () => {
		expect(cfg.name).toBe("dashboard_entries");
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("section_id");
		expect(cols).toContain("dashboard_id");
		expect(cols).toContain("organization_id");
		expect(cols).toContain("body");
		expect(cols).toContain("knowledge_document_id");
		expect(cols).toContain("status");
		expect(cols).toContain("priority");
		expect(cols).toContain("created_by_user_id");
		expect(cols).toContain("position");
	});

	it("knowledge_document_id is nullable (set-null reuse of the notebook MDX)", () => {
		const col = column(dashboardEntries, "knowledge_document_id");
		expect(col?.notNull).toBe(false);
	});

	it("indexes section_id + dashboard_id + organization_id", () => {
		const names = indexNames(dashboardEntries);
		expect(names).toContain("dashboard_entries_section_idx");
		expect(names).toContain("dashboard_entries_dashboard_idx");
		expect(names).toContain("dashboard_entries_org_idx");
	});
});
