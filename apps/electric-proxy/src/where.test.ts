import { describe, expect, test } from "bun:test";
import { buildWhereClause } from "./where";

describe("buildWhereClause", () => {
	for (const tableName of [
		"journal_entries",
		"memory_import_jobs",
		"memory_items",
	] as const) {
		test(`scopes ${tableName} by organization and user`, () => {
			const clause = buildWhereClause(tableName, "org-1", ["org-1"], "user-1");

			expect(clause).not.toBeNull();
			expect(clause?.fragment).toContain("organization_id");
			expect(clause?.fragment).toContain("created_by");
			expect(clause?.params).toEqual(["org-1", "user-1"]);
		});
	}

	test("keeps org-scoped tables scoped only by organization", () => {
		const clause = buildWhereClause("tasks", "org-1", ["org-1"], "user-1");

		expect(clause).not.toBeNull();
		expect(clause?.fragment).toContain("organization_id");
		expect(clause?.fragment).not.toContain("created_by");
		expect(clause?.params).toEqual(["org-1"]);
	});
});
