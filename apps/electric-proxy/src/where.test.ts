import { describe, expect, test } from "bun:test";
import { isUserScoped, TABLE_SCOPES } from "./table-scopes";
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

	test("scopes sandbox_images by organization (C2 — now syncable)", () => {
		const clause = buildWhereClause(
			"sandbox_images",
			"org-1",
			["org-1"],
			"user-1",
		);

		expect(clause).not.toBeNull();
		expect(clause?.fragment).toContain("organization_id");
		expect(clause?.fragment).not.toContain("created_by");
		expect(clause?.params).toEqual(["org-1"]);
	});

	test("subscriptions is scoped by reference_id (= org)", () => {
		const clause = buildWhereClause(
			"subscriptions",
			"org-1",
			["org-1"],
			"user-1",
		);

		expect(clause).not.toBeNull();
		expect(clause?.fragment).toContain("reference_id");
		expect(clause?.params).toEqual(["org-1"]);
	});

	test("auth.organizations scopes by the full org-id set", () => {
		const clause = buildWhereClause(
			"auth.organizations",
			"",
			["org-1", "org-2"],
			"user-1",
		);

		expect(clause).not.toBeNull();
		expect(clause?.fragment).toContain('"id"');
		expect(clause?.params).toEqual(["org-1", "org-2"]);
	});

	test("auth.organizations with no orgs returns the empty set (1 = 0)", () => {
		const clause = buildWhereClause("auth.organizations", "", [], "user-1");

		expect(clause).toEqual({ fragment: "1 = 0", params: [] });
	});

	test("auth.users scopes by organization_ids array containment", () => {
		const clause = buildWhereClause("auth.users", "org-1", ["org-1"], "user-1");

		expect(clause).not.toBeNull();
		expect(clause?.fragment).toContain("organization_ids");
		expect(clause?.params).toEqual(["org-1"]);
	});

	test("auth.apikeys is org-scoped via a raw fragment", () => {
		const clause = buildWhereClause(
			"auth.apikeys",
			"org-1",
			["org-1"],
			"user-1",
		);

		expect(clause).not.toBeNull();
		expect(clause?.fragment).toContain("organization_id");
		expect(clause?.params).toEqual(["org-1"]);
	});

	test("returns null for an unknown table (fail-closed)", () => {
		expect(
			buildWhereClause("not_a_table", "org-1", ["org-1"], "user-1"),
		).toBeNull();
	});

	test("every registry table yields a non-null where clause", () => {
		for (const tableName of Object.keys(TABLE_SCOPES)) {
			const orgIds = tableName === "auth.organizations" ? ["org-1"] : ["org-1"];
			const clause = buildWhereClause(tableName, "org-1", orgIds, "user-1");
			expect(clause, `expected a clause for ${tableName}`).not.toBeNull();
		}
	});

	test("isUserScoped is derived from the registry's userColumn", () => {
		expect(isUserScoped("journal_entries")).toBe(true);
		expect(isUserScoped("memory_items")).toBe(true);
		expect(isUserScoped("tasks")).toBe(false);
		expect(isUserScoped("sandbox_images")).toBe(false);
	});
});
