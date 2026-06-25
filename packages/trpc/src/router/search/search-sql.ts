/**
 * Pure query/ranking builders for the F16 cross-entity faceted search.
 *
 * No DB handle, no tRPC ctx — just SQL-fragment construction, so the
 * matching / ranking / headline logic is fully unit-testable (see
 * search-sql.test.ts). Mirrors the notebooks `search-notes` module.
 *
 * INVARIANT (index <-> query): the `entitySearchVectorSql(...)` expression is the
 * SINGLE source of truth, reused both by each entity's GIN index
 * (packages/db/src/schema/*) and by the runtime query here. If the two ever
 * diverge, Postgres silently stops using the index and falls back to a
 * sequential scan. The helper is imported from `@rox/db/schema` so they cannot
 * drift; a drift-guard unit test asserts the rendered SQL is byte-identical.
 *
 * CONFIG: `'simple'` (no stemming, language-agnostic) — the safe default for the
 * app's mixed Russian/English content; `'english'`/`'russian'` would bias one
 * language and mangle the other.
 */

import { entitySearchVectorSql, NOTES_FTS_CONFIG } from "@rox/db/schema";
import {
	NOTES_HEADLINE_START,
	NOTES_HEADLINE_STOP,
} from "@rox/shared/knowledge";
import type { AnyColumn, SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

// Re-export the canonical FTS config + vector helper from the schema package.
// They are DEFINED ALONGSIDE the GIN indexes (packages/db/.../*.ts) and imported
// here so the index expression and the query expression are produced by the
// exact same function — they cannot drift (a drift would force a seq scan).
export { entitySearchVectorSql, NOTES_FTS_CONFIG };

/**
 * Normalize a raw user query: trim, collapse internal whitespace, and return
 * `null` when nothing meaningful remains so the procedure can short-circuit to
 * empty results without ever building a query against an empty term.
 */
export function normalizeSearchQuery(raw: string): string | null {
	const collapsed = raw.trim().replace(/\s+/g, " ");
	return collapsed.length === 0 ? null : collapsed;
}

/** The SQL fragments the procedure needs to run + rank + summarize a facet. */
export interface FacetSearchSqlParts {
	/** `websearch_to_tsquery('simple', $q)` — lenient, never throws on punctuation. */
	tsquery: SQL;
	/** `<vector> @@ <tsquery>` — the WHERE match predicate. */
	match: SQL;
	/** `ts_rank(<vector>, <tsquery>)` — relevance score (higher = better). */
	rank: SQL<number>;
	/** `ts_headline('simple', <source>, <tsquery>, ...)` — highlighted snippet. */
	headline: SQL<string>;
}

export interface BuildFacetSearchSqlArgs {
	/** A normalized, non-empty query (callers must normalize first). */
	query: string;
	/**
	 * The ordered text columns this facet matches over — MUST be the SAME columns,
	 * in the SAME order, that the entity's GIN index was built from, or the index
	 * is not used. e.g. `[chatMessages.content]`, `[tasks.title, tasks.description]`.
	 */
	columns: readonly AnyColumn[];
}

/**
 * Build the tsquery / match / rank / headline SQL fragments for one entity facet.
 *
 * The query text is bound as a parameter (no string interpolation), and the same
 * `entitySearchVectorSql(columns)` vector is reused by both `match` and `rank` so
 * the GIN index is actually used for the scan AND the ranking reads the indexed
 * shape. `ts_headline` highlights over the SAME `coalesce|| ...` document text the
 * match vector indexes, so a match in any covered column yields a snippet; with
 * the proc's LIMIT it is only computed for the page.
 */
export function buildFacetSearchSql({
	query,
	columns,
}: BuildFacetSearchSqlArgs): FacetSearchSqlParts {
	const config = sql.raw(NOTES_FTS_CONFIG);
	const vector = entitySearchVectorSql(columns);
	// The plain document TEXT the search vector is built from, mirroring the inner
	// expression of `entitySearchVectorSql` exactly (same coalesce/space-join
	// order). `ts_headline` highlights over this raw text — NOT a tsvector — so it
	// must cover every column the match vector indexes.
	const headlineDocument = sql.join(
		columns.map((col) => sql`coalesce(${col}, '')`),
		sql` || ' ' || `,
	);
	const tsquery = sql`websearch_to_tsquery('${config}', ${query})`;
	const match = sql`${vector} @@ ${tsquery}`;
	const rank = sql<number>`ts_rank(${vector}, ${tsquery})`;
	const headline = sql<string>`ts_headline('${config}', ${headlineDocument}, ${tsquery}, ${`StartSel=${NOTES_HEADLINE_START},StopSel=${NOTES_HEADLINE_STOP},MaxFragments=2,MinWords=5,MaxWords=18`})`;
	return { tsquery, match, rank, headline };
}
