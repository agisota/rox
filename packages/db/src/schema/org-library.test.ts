import { describe, expect, it } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import {
	skillLibraries,
	skillLibraryItems,
	skillLibraryTeamAssignments,
} from "./org-library";

/**
 * Drizzle exposes index/unique names on `index.config.name`, and `uniqueIndex`
 * objects are returned under `getTableConfig().indexes`. Collect every named
 * index/unique on a table so shape assertions are accessor-agnostic.
 */
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

describe("skill_libraries (WS-O T2)", () => {
	const cfg = getTableConfig(skillLibraries);

	it("is named skill_libraries", () => {
		expect(cfg.name).toBe("skill_libraries");
	});

	it("has the org spine + slug/name shape", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("id");
		expect(cols).toContain("organization_id");
		expect(cols).toContain("v2_project_id");
		expect(cols).toContain("slug");
		expect(cols).toContain("name");
		expect(cols).toContain("description");
		expect(cols).toContain("created_by_user_id");
		expect(cols).toContain("created_at");
		expect(cols).toContain("updated_at");
	});

	it("exposes Insert/Select types via inferred shape", () => {
		const sel: (typeof skillLibraries)["$inferSelect"] = {
			id: "x",
			organizationId: "o",
			v2ProjectId: null,
			slug: "s",
			name: "n",
			description: null,
			createdByUserId: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		expect(sel.slug).toBe("s");
	});

	it("uniques (org_id, slug)", () => {
		expect(indexNames(skillLibraries)).toContain(
			"skill_libraries_org_slug_unique",
		);
	});

	it("indexes organization_id", () => {
		expect(indexNames(skillLibraries)).toContain("skill_libraries_org_idx");
	});
});

describe("skill_library_items (WS-O T2)", () => {
	const cfg = getTableConfig(skillLibraryItems);

	it("is named skill_library_items", () => {
		expect(cfg.name).toBe("skill_library_items");
	});

	it("links a library to a skill with denormalized organization_id + position", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("library_id");
		expect(cols).toContain("skill_id");
		expect(cols).toContain("organization_id");
		expect(cols).toContain("position");
	});

	it("uniques (library_id, skill_id)", () => {
		expect(indexNames(skillLibraryItems)).toContain(
			"skill_library_items_library_skill_unique",
		);
	});

	it("indexes denormalized organization_id (Electric shape filter)", () => {
		expect(indexNames(skillLibraryItems)).toContain(
			"skill_library_items_org_idx",
		);
	});
});

describe("skill_library_team_assignments (WS-O T2)", () => {
	const cfg = getTableConfig(skillLibraryTeamAssignments);

	it("is named skill_library_team_assignments", () => {
		expect(cfg.name).toBe("skill_library_team_assignments");
	});

	it("links a library to a team with denormalized organization_id", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("library_id");
		expect(cols).toContain("team_id");
		expect(cols).toContain("organization_id");
	});

	it("uniques (library_id, team_id)", () => {
		expect(indexNames(skillLibraryTeamAssignments)).toContain(
			"skill_library_team_assignments_library_team_unique",
		);
	});

	it("indexes denormalized organization_id", () => {
		expect(indexNames(skillLibraryTeamAssignments)).toContain(
			"skill_library_team_assignments_org_idx",
		);
	});
});
