import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { knowledgeDocuments } from "@rox/db/schema";
import {
	NOTES_HEADLINE_START,
	NOTES_HEADLINE_STOP,
} from "@rox/shared/knowledge";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	buildNotesSearchSql,
	NOTES_FTS_CONFIG,
	normalizeNotesSearchQuery,
	notesSearchVectorSql,
} from "./search-notes";

// Render a drizzle SQL node to its concrete SQL string for byte-level
// assertions (mirrors the PgDialect().sqlToQuery harness in renameHandle.test.ts).
const dialect = new PgDialect();
const render = (node: Parameters<typeof dialect.sqlToQuery>[0]) =>
	dialect.sqlToQuery(node).sql;

const cols = {
	titleCol: knowledgeDocuments.title,
	markdownCol: knowledgeDocuments.markdown,
};

describe("normalizeNotesSearchQuery", () => {
	test("returns null for an empty string", () => {
		expect(normalizeNotesSearchQuery("")).toBeNull();
	});

	test("returns null for whitespace-only input", () => {
		expect(normalizeNotesSearchQuery("   ")).toBeNull();
		expect(normalizeNotesSearchQuery("\t\n  ")).toBeNull();
	});

	test("trims and collapses internal whitespace", () => {
		expect(normalizeNotesSearchQuery("  foo  bar ")).toBe("foo bar");
		expect(normalizeNotesSearchQuery("a\t\nb   c")).toBe("a b c");
	});

	test("leaves a single clean token unchanged", () => {
		expect(normalizeNotesSearchQuery("hello")).toBe("hello");
	});

	test("preserves non-ASCII (Russian) content", () => {
		expect(normalizeNotesSearchQuery("  Новая   заметка ")).toBe(
			"Новая заметка",
		);
	});
});

describe("NOTES_FTS_CONFIG", () => {
	test("is a stable literal text-search config (immutable regconfig)", () => {
		// The config MUST be a string literal so the index expression is IMMUTABLE
		// and the query can repeat it byte-for-byte.
		expect(typeof NOTES_FTS_CONFIG).toBe("string");
		expect(NOTES_FTS_CONFIG).toBe("simple");
	});
});

describe("notesSearchVectorSql (index <-> query drift guard)", () => {
	test("renders the to_tsvector expression over title+markdown", () => {
		const out = render(notesSearchVectorSql(cols));
		expect(out).toContain(`to_tsvector('${NOTES_FTS_CONFIG}'`);
		expect(out).toContain("coalesce");
		expect(out).toContain("title");
		expect(out).toContain("markdown");
	});

	test("matches the committed CREATE INDEX expression (protects index usage)", () => {
		// THE drift guard: the expression frozen into the generated GIN-index
		// migration and the one the query builds must describe the SAME parsed
		// expression, or Postgres silently falls back to a seq scan. Both come from
		// the SAME `notesSearchVectorSql` helper, so the only legal difference is the
		// table qualifier — drizzle-kit emits unqualified columns inside
		// `CREATE INDEX ... ON "knowledge_documents"` (the qualifier is implicit),
		// while the runtime JOIN query renders them qualified. Postgres matches on
		// the parsed tree, not the text, so qualification is irrelevant to index
		// usage; we normalize it away and assert the rest is byte-identical.
		const stripQualifier = (s: string) =>
			s.replaceAll('"knowledge_documents".', "");

		const queryExpr = stripQualifier(render(notesSearchVectorSql(cols)));

		const migrationDir = join(import.meta.dir, "../../../../db/drizzle");
		const migrationFile = join(migrationDir, "0100_notes_fts_index.sql");
		const migrationSql = readFileSync(migrationFile, "utf8");
		const indexMatch = migrationSql.match(/USING gin \((.+)\)\s*;?\s*$/);
		expect(indexMatch).not.toBeNull();
		const indexExpr = indexMatch?.[1] ?? "";

		expect(indexExpr).toBe(queryExpr);
		// Sanity: the frozen migration expression is the exact text we expect.
		expect(indexExpr).toBe(
			`to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("markdown", ''))`,
		);
	});
});

describe("buildNotesSearchSql", () => {
	const parts = buildNotesSearchSql({ query: "hello world", ...cols });

	test("tsquery uses websearch_to_tsquery with the shared config", () => {
		const out = render(parts.tsquery);
		expect(out).toContain(`websearch_to_tsquery('${NOTES_FTS_CONFIG}'`);
	});

	test("match applies the @@ operator against the shared vector", () => {
		const out = render(parts.match);
		expect(out).toContain("@@");
		expect(out).toContain(`to_tsvector('${NOTES_FTS_CONFIG}'`);
		expect(out).toContain(`websearch_to_tsquery('${NOTES_FTS_CONFIG}'`);
	});

	test("rank wraps ts_rank over the SAME indexed vector expression", () => {
		const rankExpr = render(parts.rank);
		expect(rankExpr).toContain("ts_rank(");
		// The vector inside ts_rank must be the identical indexed expression so the
		// ranking reuses the GIN index, not a re-computed mismatched vector.
		expect(rankExpr).toContain(render(notesSearchVectorSql(cols)));
	});

	test("headline highlights over the SAME field set the match vector indexes (title-only matches are covered)", () => {
		// REGRESSION: ts_headline must run over the same `title || ' ' || markdown`
		// text the match/rank vector indexes. The old expression highlighted
		// `coalesce(markdown, title)` = markdown whenever markdown was non-null, so a
		// TITLE-ONLY match produced an empty/misleading snippet. The document text
		// passed to ts_headline must therefore be the title+markdown concat (NOT a
		// single-field coalesce), so the matched term is always inside the snippet
		// source regardless of which field it lived in.
		const out = render(parts.headline);
		// The concat the vector indexes (sans to_tsvector) — see the vector drift guard.
		expect(out).toContain(
			`coalesce("knowledge_documents"."title", '') || ' ' || coalesce("knowledge_documents"."markdown", '')`,
		);
		// Must NOT be the old single-field coalesce that dropped title-only matches.
		expect(out).not.toContain(
			`coalesce("knowledge_documents"."markdown", "knowledge_documents"."title")`,
		);
		// The headline config must match the match/rank config ('simple'), same as
		// the vector — a mismatched config would tokenize the snippet differently
		// from the match and could fail to wrap the term.
		expect(out).toContain(`ts_headline('${NOTES_FTS_CONFIG}'`);
	});

	test("headline wraps ts_headline with safe-sentinel fragment options", () => {
		const out = render(parts.headline);
		expect(out).toContain("ts_headline(");
		expect(out).toContain(`websearch_to_tsquery('${NOTES_FTS_CONFIG}'`);
		// The options string (incl. MaxFragments + the custom Start/Stop sentinels)
		// is bound as a parameter, not interpolated — assert via params.
		const opts = dialect.sqlToQuery(parts.headline).params;
		expect(
			opts.some((p) => typeof p === "string" && p.includes("MaxFragments")),
		).toBe(true);
		expect(
			opts.some(
				(p) =>
					typeof p === "string" &&
					p.includes(NOTES_HEADLINE_START) &&
					p.includes(NOTES_HEADLINE_STOP),
			),
		).toBe(true);
	});

	test("the query string is passed as a bound parameter (not interpolated)", () => {
		// websearch_to_tsquery should receive the user query as a $param to avoid
		// any injection surface.
		const q = dialect.sqlToQuery(parts.tsquery);
		expect(q.params).toContain("hello world");
	});

	test("accepts punctuation / quotes without throwing (websearch_to_tsquery is lenient)", () => {
		expect(() =>
			buildNotesSearchSql({ query: '"quoted" foo & bar | baz !', ...cols }),
		).not.toThrow();
	});

	test("accepts a 200-char query without throwing", () => {
		const long = "a".repeat(200);
		expect(() => buildNotesSearchSql({ query: long, ...cols })).not.toThrow();
	});
});
