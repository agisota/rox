/**
 * Pure query/ranking builder for Notes full-text search (D7 FTS).
 *
 * No DB handle, no tRPC ctx — just SQL-fragment construction, so the ranking /
 * matching / headline logic is fully unit-testable (see search-notes.test.ts).
 *
 * INVARIANT (index <-> query): the `to_tsvector(...)` expression below is the
 * SINGLE source of truth, reused both by the GIN index on `knowledge_documents`
 * (packages/db/src/schema/knowledge.ts) and by the runtime query. If the two
 * ever diverge — different text-search config, different coalesce/concat order —
 * Postgres silently stops using the index and falls back to a sequential scan.
 * `notesSearchVectorSql` exists so they cannot drift; a drift-guard unit test
 * asserts the rendered SQL is byte-identical.
 *
 * IMMUTABILITY: the text-search config MUST be a string literal (`NOTES_FTS_CONFIG`),
 * never a column reference — `to_tsvector('simple', text)` is IMMUTABLE (required
 * for an index expression) whereas `to_tsvector(<column>, text)` is not and the
 * CREATE INDEX would fail.
 *
 * CONFIG: `'simple'` (no stemming, language-agnostic) is the safe default for the
 * app's mixed Russian/English note content — `'english'`/`'russian'` would bias
 * one language and mangle the other.
 */

import { NOTES_FTS_CONFIG, notesSearchVectorSql } from "@rox/db/schema";
import {
	NOTES_HEADLINE_START,
	NOTES_HEADLINE_STOP,
} from "@rox/shared/knowledge";
import type { AnyColumn, SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

// Re-export the canonical FTS config + vector helper from the schema package.
// They are DEFINED ALONGSIDE the GIN index (packages/db/.../knowledge.ts) and
// imported here so the index expression and the query expression are produced by
// the exact same function — they cannot drift (a drift would force a seq scan).
export { NOTES_FTS_CONFIG, notesSearchVectorSql };

/** The columns whose text is fed into the search vector. */
export interface NotesSearchVectorColumns {
	titleCol: AnyColumn;
	markdownCol: AnyColumn;
}

/**
 * Normalize a raw user query: trim, collapse internal whitespace, and return
 * `null` when nothing meaningful remains so the procedure can short-circuit to an
 * empty result without ever building a query against an empty term.
 */
export function normalizeNotesSearchQuery(raw: string): string | null {
	const collapsed = raw.trim().replace(/\s+/g, " ");
	return collapsed.length === 0 ? null : collapsed;
}

/** The SQL fragments the procedure needs to run + rank + summarize a search. */
export interface NotesSearchSqlParts {
	/** `websearch_to_tsquery('simple', $q)` — lenient, never throws on punctuation. */
	tsquery: SQL;
	/** `<vector> @@ <tsquery>` — the WHERE match predicate. */
	match: SQL;
	/** `ts_rank(<vector>, <tsquery>)` — relevance score (higher = better). */
	rank: SQL<number>;
	/** `ts_headline('simple', <source>, <tsquery>, ...)` — highlighted snippet. */
	headline: SQL<string>;
}

export interface BuildNotesSearchSqlArgs extends NotesSearchVectorColumns {
	/** A normalized, non-empty query (callers must normalize first). */
	query: string;
}

/**
 * Build the tsquery / match / rank / headline SQL fragments for a notes FTS run.
 *
 * The query text is bound as a parameter (no string interpolation), and the same
 * `notesSearchVectorSql` vector is reused by both `match` and `rank` so the GIN
 * index is actually used for the scan AND the ranking reads the indexed shape.
 * `ts_headline` reads `coalesce(markdown, title)` so a snippet is produced even
 * for body-less notes; with the proc's LIMIT it is only computed for the page.
 */
export function buildNotesSearchSql({
	query,
	titleCol,
	markdownCol,
}: BuildNotesSearchSqlArgs): NotesSearchSqlParts {
	const config = sql.raw(NOTES_FTS_CONFIG);
	const vector = notesSearchVectorSql({ titleCol, markdownCol });
	const tsquery = sql`websearch_to_tsquery('${config}', ${query})`;
	const match = sql`${vector} @@ ${tsquery}`;
	const rank = sql<number>`ts_rank(${vector}, ${tsquery})`;
	const headline = sql<string>`ts_headline('${config}', coalesce(${markdownCol}, ${titleCol}), ${tsquery}, ${`StartSel=${NOTES_HEADLINE_START},StopSel=${NOTES_HEADLINE_STOP},MaxFragments=2,MinWords=5,MaxWords=18`})`;
	return { tsquery, match, rank, headline };
}
