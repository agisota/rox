/**
 * Pure query/ranking builders for the FN-138 (#698) `mail.search` FTS endpoint.
 *
 * No DB handle, no tRPC ctx — just SQL-fragment + key construction, so the
 * matching / ranking logic is fully unit-testable (see search-sql.test.ts).
 * Mirrors the F16 cross-entity `search/search-sql.ts` module.
 *
 * INVARIANT (index <-> query): `mailSearchVectorSql(...)` (from `@rox/db/schema`)
 * is the SINGLE source of truth for the search document — it is reused by BOTH
 * the `mail_messages_fts_idx` GIN index (packages/db/src/schema/mail.ts) and the
 * runtime query here. If the two ever diverge, Postgres silently stops using the
 * index and falls back to a sequential scan, so they MUST be produced by the same
 * helper.
 *
 * CONFIG: `'simple'` (no stemming, language-agnostic) — the safe default for the
 * app's mixed Russian/English mail content.
 */

import { mailMessages, mailSearchVectorSql } from "@rox/db/schema";
import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

/**
 * Normalize a raw user query: trim + collapse internal whitespace, returning
 * `null` when nothing meaningful remains so the procedure short-circuits to an
 * empty result instead of building a query against an empty term.
 */
export function normalizeMailSearchQuery(raw: string): string | null {
	const collapsed = raw.trim().replace(/\s+/g, " ");
	return collapsed.length === 0 ? null : collapsed;
}

/** The SQL fragments the `mail.search` procedure needs to match + rank. */
export interface MailSearchSqlParts {
	/** `websearch_to_tsquery('simple', $q)` — lenient, never throws on punctuation. */
	tsquery: SQL;
	/** `<vector> @@ <tsquery>` — the WHERE match predicate over the message doc. */
	match: SQL;
	/** `ts_rank(<vector>, <tsquery>)` — relevance score (higher = better). */
	rank: SQL<number>;
}

/**
 * Build the tsquery / match / rank fragments for `mail.search`.
 *
 * The query text is bound as a PARAMETER (no string interpolation) and the same
 * `mailSearchVectorSql(...)` vector — over `mail_messages.subject || snippet ||
 * from_addr || from_name` — is reused by both `match` and `rank`, so the GIN
 * index is actually consulted for the scan AND the ranking reads the indexed
 * shape. Callers must normalize the query first (see {@link normalizeMailSearchQuery}).
 */
export function buildMailSearchSql(query: string): MailSearchSqlParts {
	const vector = mailSearchVectorSql({
		subjectCol: mailMessages.subject,
		snippetCol: mailMessages.snippet,
		fromAddrCol: mailMessages.fromAddr,
		fromNameCol: mailMessages.fromName,
	});
	const tsquery = sql`websearch_to_tsquery('simple', ${query})`;
	const match = sql`${vector} @@ ${tsquery}`;
	const rank = sql<number>`ts_rank(${vector}, ${tsquery})`;
	return { tsquery, match, rank };
}
