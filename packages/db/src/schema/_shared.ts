/**
 * Neutral structural types for the graph core (#01).
 *
 * This file is the *core* layer and MUST NOT import any domain schema file
 * (knowledge.ts, agent.ts, …). The invariant from the L3 shared contract is:
 * the graph core depends on no domain subsystem — domains depend on it.
 *
 * `EntitySourceRef` describes the provenance of a graph node (where the node
 * came from: a capture run, an import batch, a chat conversation, a file, …).
 * The open record tail lets domains attach their own provenance fields without
 * widening the core type. Domain files (e.g. knowledge.ts #03) re-export this as
 * an alias for backwards-compat, so the dependency direction is domain → core.
 */

export type EntitySourceRef = {
	conversationId?: string;
	runId?: string;
	importBatchId?: string;
	filePath?: string;
	url?: string;
	provider?: string;
} & Record<string, unknown>;

// ---------------------------------------------------------------------------
// Full-text search vector (shared by notes FTS + F16 cross-entity search)
// ---------------------------------------------------------------------------

import type { AnyColumn, SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

/**
 * Postgres text-search configuration for ALL app FTS (notes + cross-entity).
 * A STRING LITERAL (never a column) so the derived `to_tsvector(...)` expression
 * is IMMUTABLE and therefore indexable — `to_tsvector('simple', text)` is
 * immutable whereas `to_tsvector(<column>, text)` is not and CREATE INDEX fails.
 *
 * `'simple'` (no stemming, language-agnostic) is the safe default for the app's
 * mixed Russian/English content; `'english'`/`'russian'` would bias one language
 * and mangle the other.
 *
 * Lives in the core `_shared` layer (no domain imports) so every entity schema
 * (knowledge, chat, journal, tasks, drive) can build an identically-shaped FTS
 * vector without a cross-domain import cycle.
 */
export const NOTES_FTS_CONFIG = "simple" as const;

/**
 * The shared `to_tsvector('simple', …)` document vector over an ordered set of
 * text columns — `knowledge.title || markdown`, `chat_messages.content`,
 * `journal_entries.reflection`, `tasks.title || description`, `drive_files.name`.
 *
 * SINGLE SOURCE OF TRUTH for every FTS expression: each entity's GIN index and
 * the runtime search query both call this helper, so the indexed expression and
 * the query expression can never drift (a drift makes Postgres silently fall
 * back to a seq scan). Every column is `coalesce(.., '')`-d and parts are
 * space-joined so the expression stays total for nullable columns.
 *
 * INVARIANT: callers MUST pass at least one column; an empty list yields a
 * vector over '' that matches nothing.
 */
export function entitySearchVectorSql(columns: readonly AnyColumn[]): SQL {
	const document = sql.join(
		columns.map((col) => sql`coalesce(${col}, '')`),
		sql` || ' ' || `,
	);
	return sql`to_tsvector('${sql.raw(NOTES_FTS_CONFIG)}', ${document})`;
}

/**
 * Two-column convenience wrapper preserving the original notes FTS signature
 * (`title || markdown`). Kept so the existing notes index/query call sites and
 * their byte-level drift-guard tests stay unchanged.
 */
export function notesSearchVectorSql(columns: {
	titleCol: AnyColumn;
	markdownCol: AnyColumn;
}): SQL {
	return entitySearchVectorSql([columns.titleCol, columns.markdownCol]);
}
