/**
 * Chat message full-text search — shared core types + instant local filter (F15).
 *
 * Two layers, one source of truth for every platform (web / desktop / mobile):
 *
 *  - `MessageSearchResult` — the shape the `chat.searchMessages` tRPC procedure
 *    returns for ONE matched message: the highlighted `ts_headline` snippet (with
 *    the SAME `[[hl]]…[[/hl]]` sentinels the notes/faceted search use, so the UI
 *    reuses `splitHighlightedSnippet` to render a safe `<mark>`), plus the
 *    relevance score and timestamps for deterministic ordering / navigation.
 *
 *  - `filterByTitleTerm` — the INSTANT, dependency-free title-match used while the
 *    async content search is in flight. It is a pure substring match over a
 *    caller-supplied display title (e.g. the first line of each loaded message, or
 *    a session title), so the UI shows immediate feedback the keystroke after the
 *    user types, then layers the backend content hits on top once they resolve
 *    (the two never block each other — see the panel in `@rox/ui`).
 *
 * Dependency-free (no React, no tRPC, no `@rox/db`) so it stays platform-neutral
 * and unit-testable; `@rox/trpc` and the UI both import from here.
 */

/** One matched chat message as returned by `chat.searchMessages`. */
export interface MessageSearchResult {
	/** `chat_messages.id`. */
	id: string;
	/** The session the message belongs to (echoed for navigation/grouping). */
	sessionId: string;
	/** Author role (`user` / `assistant` / `system` / `tool`). */
	role: string;
	/**
	 * A short display line derived from the message content's first non-empty line
	 * (the message has no title). The full match is highlighted in `snippet`.
	 */
	title: string;
	/**
	 * `ts_headline` snippet with `[[hl]]…[[/hl]]` sentinels around matched terms,
	 * or null when Postgres produced no fragment. Render with
	 * `splitHighlightedSnippet` + `<mark>` — NEVER `dangerouslySetInnerHTML`.
	 */
	snippet: string | null;
	/** FTS relevance (`ts_rank`); higher = better. Used only for ordering. */
	score: number;
	/** Stable secondary ordering key (ISO 8601). */
	createdAt: string;
}

/** The `chat.searchMessages` response: ranked hits + the full match count. */
export interface MessageSearchResponse {
	results: MessageSearchResult[];
	/** Total matches for the query, independent of the page LIMIT. */
	totalCount: number;
}

/**
 * Normalize a raw user query the same way the server does (trim + collapse
 * internal whitespace). Returns `null` when nothing meaningful remains so callers
 * can short-circuit both the instant filter and the backend call to "empty".
 */
export function normalizeMessageSearchQuery(raw: string): string | null {
	const collapsed = raw.trim().replace(/\s+/g, " ");
	return collapsed.length === 0 ? null : collapsed;
}

/** An item the instant title-filter ranks: any object with an `id` + `title`. */
export interface TitleFilterable {
	id: string;
	title: string;
}

/**
 * Instant, case-insensitive substring filter over a list's display titles — the
 * synchronous half of F15's "instant title-match + async content-search". Pure
 * and total: an empty/whitespace term returns the input unchanged (every item),
 * so the panel shows the full list until the user types. Matching is
 * accent-/case-insensitive via `toLocaleLowerCase` and preserves input order
 * (the caller already ordered the list).
 */
export function filterByTitleTerm<T extends TitleFilterable>(
	items: readonly T[],
	term: string,
): T[] {
	const normalized = normalizeMessageSearchQuery(term);
	if (normalized === null) {
		return [...items];
	}
	const needle = normalized.toLocaleLowerCase();
	return items.filter((item) =>
		item.title.toLocaleLowerCase().includes(needle),
	);
}
