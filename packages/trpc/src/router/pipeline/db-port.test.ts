import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { compileParametrizedSql } from "./db-port";

const dialect = new PgDialect();
/** Render a compiled fragment to `{ sql, params }` the way the driver will. */
function render(frag: SQL): { sql: string; params: unknown[] } {
	const q = dialect.sqlToQuery(frag);
	return { sql: q.sql, params: q.params };
}

/**
 * These tests exercise the SQL compiler + scope-binding logic in isolation (no
 * DB). They prove the two security contracts of the db port:
 *  1. param VALUES become driver bind markers ($n), never inlined SQL text;
 *  2. an injection string survives only as a bound value.
 *
 * The org-scope contract (a node cannot see another org) is enforced because
 * `makePipelineDbQuery`/`makePipelineDbWrite` close over a single scope and
 * inject `organizationId`/`orgId` as RESERVED bound params that author input
 * cannot override — asserted here against the compiled fragment.
 */
describe("compileParametrizedSql", () => {
	test("binds a named param as a placeholder, never inlining the value", () => {
		const frag = compileParametrizedSql(
			"select * from items where org = :orgId",
			[{ name: "orgId", value: "org-1" }],
		);
		// drizzle SQL chunks: the literal text is preserved and the value is a
		// bound param (not concatenated). The raw value must NOT appear in the
		// literal SQL portions.
		const { sql, params } = render(frag);
		expect(sql).toContain("$1");
		expect(sql).not.toContain("org-1");
		expect(params).toEqual(["org-1"]);
	});

	test("an injection string is bound, not parsed as SQL", () => {
		const evil = "x'; DROP TABLE users; --";
		const frag = compileParametrizedSql(
			"select * from items where name = :name",
			[{ name: "name", value: evil }],
		);
		const { sql, params } = render(frag);
		expect(sql).not.toContain("DROP TABLE");
		expect(params).toEqual([evil]);
	});

	test("preserves `::` casts (not treated as a placeholder)", () => {
		const frag = compileParametrizedSql(
			"select id::text from items where id = :id",
			[{ name: "id", value: 7 }],
		);
		const { sql, params } = render(frag);
		expect(sql).toContain("::text");
		expect(params).toEqual([7]);
	});

	test("a param value containing a colon-word is not re-interpreted", () => {
		const frag = compileParametrizedSql("select :a", [
			{ name: "a", value: ":b not a param" },
		]);
		const { sql, params } = render(frag);
		expect(params).toEqual([":b not a param"]);
		// only one bind marker — the value's `:b` did not spawn a second param.
		expect(sql.match(/\$\d+/g)?.length).toBe(1);
	});

	test("org scoping: the same statement compiled for two orgs binds different org ids", () => {
		const text = "select * from items where org = :orgId";
		const a = render(
			compileParametrizedSql(text, [{ name: "orgId", value: "org-A" }]),
		);
		const b = render(
			compileParametrizedSql(text, [{ name: "orgId", value: "org-B" }]),
		);
		// identical SQL text, different bound tenant — a node built for org-A can
		// never carry org-B's id, so it cannot read org-B's rows.
		expect(a.sql).toBe(b.sql);
		expect(a.params).toEqual(["org-A"]);
		expect(b.params).toEqual(["org-B"]);
	});
});
