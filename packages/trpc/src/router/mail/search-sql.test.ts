import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildMailSearchSql, normalizeMailSearchQuery } from "./search-sql";

const dialect = new PgDialect();
const render = (node: Parameters<typeof dialect.sqlToQuery>[0]) =>
	dialect.sqlToQuery(node).sql;

describe("normalizeMailSearchQuery", () => {
	test("trims + collapses internal whitespace", () => {
		expect(normalizeMailSearchQuery("  hello   world ")).toBe("hello world");
	});

	test("returns null for an all-whitespace query", () => {
		expect(normalizeMailSearchQuery("   ")).toBeNull();
		expect(normalizeMailSearchQuery("")).toBeNull();
	});
});

describe("buildMailSearchSql", () => {
	test("tsquery uses websearch_to_tsquery with the 'simple' config", () => {
		const { tsquery } = buildMailSearchSql("invoice");
		expect(render(tsquery)).toContain("websearch_to_tsquery('simple'");
	});

	test("match applies @@ over a to_tsvector('simple', …) document vector", () => {
		const out = render(buildMailSearchSql("invoice").match);
		expect(out).toContain("@@");
		expect(out).toContain("to_tsvector('simple'");
		// The indexed document covers subject + snippet + from_addr + from_name.
		expect(out).toContain("subject");
		expect(out).toContain("snippet");
		expect(out).toContain("from_addr");
		expect(out).toContain("from_name");
	});

	test("rank reuses the SAME indexed vector expression as match", () => {
		const parts = buildMailSearchSql("invoice");
		const vectorFromMatch = render(parts.match).split("@@")[0]?.trim();
		expect(render(parts.rank)).toContain(vectorFromMatch ?? "<none>");
		expect(render(parts.rank)).toContain("ts_rank");
	});

	test("binds the query as a parameter (no string interpolation)", () => {
		// The rendered SQL carries a `$1` placeholder, not the literal term, so a
		// user query like a quote can never break out of the statement.
		const out = render(buildMailSearchSql(`o'brien "report"`).tsquery);
		expect(out).toContain("$1");
		expect(out).not.toContain("o'brien");
	});
});
