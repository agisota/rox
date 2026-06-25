import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	chatMessages,
	driveFiles,
	journalEntries,
	knowledgeDocuments,
	notesSearchVectorSql,
	tasks,
} from "@rox/db/schema";
import {
	NOTES_HEADLINE_START,
	NOTES_HEADLINE_STOP,
} from "@rox/shared/knowledge";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	buildFacetSearchSql,
	entitySearchVectorSql,
	NOTES_FTS_CONFIG,
	normalizeSearchQuery,
} from "./search-sql";

const dialect = new PgDialect();
const render = (node: Parameters<typeof dialect.sqlToQuery>[0]) =>
	dialect.sqlToQuery(node).sql;

describe("normalizeSearchQuery", () => {
	test("returns null for empty / whitespace-only input", () => {
		expect(normalizeSearchQuery("")).toBeNull();
		expect(normalizeSearchQuery("   ")).toBeNull();
		expect(normalizeSearchQuery("\t\n  ")).toBeNull();
	});

	test("trims and collapses internal whitespace", () => {
		expect(normalizeSearchQuery("  foo  bar ")).toBe("foo bar");
		expect(normalizeSearchQuery("a\t\nb   c")).toBe("a b c");
	});

	test("preserves non-ASCII (Russian) content", () => {
		expect(normalizeSearchQuery("  Новая   заметка ")).toBe("Новая заметка");
	});
});

describe("entitySearchVectorSql", () => {
	test("renders to_tsvector('simple', …) over a single column", () => {
		const out = render(entitySearchVectorSql([chatMessages.content]));
		expect(out).toContain(`to_tsvector('${NOTES_FTS_CONFIG}'`);
		expect(out).toContain("coalesce");
		expect(out).toContain("content");
	});

	test("space-joins multiple columns in order", () => {
		const out = render(entitySearchVectorSql([tasks.title, tasks.description]));
		const titleAt = out.indexOf('"title"');
		const descAt = out.indexOf('"description"');
		expect(titleAt).toBeGreaterThanOrEqual(0);
		expect(descAt).toBeGreaterThan(titleAt);
		expect(out).toContain("|| ' ' ||");
	});

	test("stays byte-identical to the legacy notesSearchVectorSql (no notes-index drift)", () => {
		// The two-column wrapper now delegates to entitySearchVectorSql; the existing
		// notes GIN index + its drift-guard depend on the render being unchanged.
		const legacy = render(
			notesSearchVectorSql({
				titleCol: knowledgeDocuments.title,
				markdownCol: knowledgeDocuments.markdown,
			}),
		);
		const generic = render(
			entitySearchVectorSql([
				knowledgeDocuments.title,
				knowledgeDocuments.markdown,
			]),
		);
		expect(generic).toBe(legacy);
	});
});

/**
 * THE drift guard for the F16 facets: each entity's GIN-index expression frozen
 * into the generated migration must equal the expression the query builds (same
 * `entitySearchVectorSql` helper), or Postgres silently seq-scans. drizzle-kit
 * emits unqualified columns inside `CREATE INDEX ... ON "<table>"`; the runtime
 * query renders them qualified — Postgres matches the parsed tree, so we strip
 * the table qualifier and assert the rest is identical.
 */
describe("F16 GIN index <-> query drift guard", () => {
	const migrationDir = join(import.meta.dir, "../../../../db/drizzle");

	// Concatenate every committed migration so the assertion is independent of the
	// generated filename / which migration the index landed in.
	const allMigrations = readFileSync(
		join(migrationDir, "meta", "_journal.json"),
		"utf8",
	);
	const journal = JSON.parse(allMigrations) as {
		entries: { tag: string }[];
	};
	const migrationText = journal.entries
		.map((entry) => {
			try {
				return readFileSync(join(migrationDir, `${entry.tag}.sql`), "utf8");
			} catch {
				return "";
			}
		})
		.join("\n");

	const cases: { table: string; expr: string }[] = [
		{
			table: "chat_messages",
			expr: render(entitySearchVectorSql([chatMessages.content])),
		},
		{
			table: "journal_entries",
			expr: render(entitySearchVectorSql([journalEntries.reflection])),
		},
		{
			table: "tasks",
			expr: render(entitySearchVectorSql([tasks.title, tasks.description])),
		},
		{
			table: "drive_files",
			expr: render(entitySearchVectorSql([driveFiles.name])),
		},
	];

	for (const { table, expr } of cases) {
		test(`${table} index expression matches the query expression`, () => {
			const stripQualifier = (s: string) => s.replaceAll(`"${table}".`, "");
			const queryExpr = stripQualifier(expr);
			// Find the gin index over this table in the concatenated migrations.
			const found = migrationText.includes(queryExpr);
			expect(found).toBe(true);
		});
	}
});

describe("buildFacetSearchSql", () => {
	const parts = buildFacetSearchSql({
		query: "hello world",
		columns: [tasks.title, tasks.description],
	});

	test("tsquery uses websearch_to_tsquery with the shared config", () => {
		expect(render(parts.tsquery)).toContain(
			`websearch_to_tsquery('${NOTES_FTS_CONFIG}'`,
		);
	});

	test("match applies @@ over the shared vector", () => {
		const out = render(parts.match);
		expect(out).toContain("@@");
		expect(out).toContain(`to_tsvector('${NOTES_FTS_CONFIG}'`);
	});

	test("rank reuses the SAME indexed vector expression", () => {
		expect(render(parts.rank)).toContain(
			render(entitySearchVectorSql([tasks.title, tasks.description])),
		);
	});

	test("headline highlights over the same document text, with safe sentinels", () => {
		const out = render(parts.headline);
		expect(out).toContain(`ts_headline('${NOTES_FTS_CONFIG}'`);
		const opts = dialect.sqlToQuery(parts.headline).params;
		expect(
			opts.some(
				(p) =>
					typeof p === "string" &&
					p.includes(NOTES_HEADLINE_START) &&
					p.includes(NOTES_HEADLINE_STOP),
			),
		).toBe(true);
	});

	test("binds the query as a parameter (no interpolation / injection surface)", () => {
		expect(dialect.sqlToQuery(parts.tsquery).params).toContain("hello world");
	});

	test("accepts punctuation / quotes without throwing", () => {
		expect(() =>
			buildFacetSearchSql({
				query: '"quoted" foo & bar | baz !',
				columns: [chatMessages.content],
			}),
		).not.toThrow();
	});
});
