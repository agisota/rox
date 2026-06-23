import { describe, expect, test } from "bun:test";
import { isUserScoped, TABLE_SCOPES } from "./table-scopes";
import { buildWhereClause } from "./where";

describe("buildWhereClause", () => {
	for (const tableName of [
		"journal_entries",
		"journal_events",
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

	// -------------------------------------------------------------------------
	// Comms suite shapes (AD-2). Each registered shape must scope by the
	// caller's own user column AND org so an out-of-scope row is excluded.
	// -------------------------------------------------------------------------

	describe("comms suite shapes", () => {
		for (const { table, userCol } of [
			{ table: "comms_participants", userCol: "user_id" },
			{ table: "mail_threads", userCol: "owner_user_id" },
			{ table: "mail_messages", userCol: "owner_user_id" },
			{ table: "cal_calendars", userCol: "owner_user_id" },
			{ table: "knowledge_documents", userCol: "created_by_user_id" },
		] as const) {
			test(`${table} scopes by organization AND ${userCol}`, () => {
				const clause = buildWhereClause(table, "org-1", ["org-1"], "user-1");

				expect(clause).not.toBeNull();
				expect(clause?.fragment).toContain("organization_id");
				expect(clause?.fragment).toContain(userCol);
				// Params bind the caller's org and user — no third actor can appear.
				expect(clause?.params).toEqual(["org-1", "user-1"]);
			});

			test(`${table} is user-scoped (rejects another user's rows)`, () => {
				// A different caller (user-2) produces a different bound predicate, so
				// user-1's rows can never be delivered to user-2.
				expect(isUserScoped(table)).toBe(true);

				const mine = buildWhereClause(table, "org-1", ["org-1"], "user-1");
				const theirs = buildWhereClause(table, "org-1", ["org-1"], "user-2");
				expect(mine?.params).toEqual(["org-1", "user-1"]);
				expect(theirs?.params).toEqual(["org-1", "user-2"]);
				expect(mine?.params).not.toEqual(theirs?.params);
			});

			test(`${table} binds the caller org, not an arbitrary org`, () => {
				// Even if the client passes a foreign org in the query, the where
				// fragment binds exactly what the proxy passed (membership is checked
				// in index.ts before this runs).
				const clause = buildWhereClause(table, "org-A", ["org-A"], "user-1");
				expect(clause?.params).toEqual(["org-A", "user-1"]);
			});
		}
	});

	// -------------------------------------------------------------------------
	// Deferred suite tables: NOT registered → fail-closed (null). Registering
	// any of these with a bare org filter would leak cross-user data (the #1
	// MASTER-PLAN risk). They require a cross-table subquery Electric can't
	// express, so they must stay unregistered until a safe mechanism exists.
	// -------------------------------------------------------------------------

	describe("deferred suite tables stay fail-closed (unregistered)", () => {
		for (const table of [
			"comms_threads",
			"comms_messages",
			"mail_attachments",
			"cal_events",
			"cal_event_attendees",
			"cal_calendar_shares",
		] as const) {
			test(`${table} is NOT syncable (returns null)`, () => {
				expect(
					buildWhereClause(table, "org-1", ["org-1"], "user-1"),
				).toBeNull();
				expect(isUserScoped(table)).toBe(false);
			});
		}
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
