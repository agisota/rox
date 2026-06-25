/**
 * Cross-entity faceted search — shared core types (F16).
 *
 * The SINGLE source of truth for the `SearchScope`, facet segments, and the
 * result/count shapes the search router returns and every platform (web,
 * desktop, mobile) renders. Dependency-free (no React, no tRPC, no `@rox/db`)
 * so `@rox/shared` stays db-free — `@rox/db` and `@rox/trpc` depend on it, the
 * reverse edge would be a cycle (same rule as `unified-search-results.ts`).
 *
 * F15 (chat search) shares this `SearchScope` type; until F15 lands, the chat
 * facet here IS the chat segment.
 */

/**
 * How wide a search ranges. The discriminated payload carries the id the
 * non-global scopes narrow by, so an ill-formed scope (e.g. `project` with no
 * id) is unrepresentable.
 *
 * - `global`  — every entity the caller can see (org-wide, + their own drive).
 * - `project` — only entities tied to one v2 project (`projectId`).
 * - `chat`    — only one chat session's messages (`sessionId`).
 */
export type SearchScope =
	| { type: "global" }
	| { type: "project"; projectId: string }
	| { type: "chat"; sessionId: string };

/** The discriminant alone, for switches and UI scope toggles. */
export type SearchScopeType = SearchScope["type"];

export const SEARCH_SCOPE_TYPES = ["global", "project", "chat"] as const;

/**
 * The facet segments the search splits results into. Names mirror the F16 spec
 * (Titles / Messages / Tool calls / Files); each maps to one or more entities:
 *
 * - `titles`   — knowledge documents, notes, journal reflections (titled docs).
 * - `messages` — chat messages (reuses F15 `searchMessages` once it lands).
 * - `toolCalls`— tasks (the actionable / tool-call lane of Project-OS).
 * - `files`    — drive files.
 */
export type SearchFacet = "titles" | "messages" | "toolCalls" | "files";

export const SEARCH_FACETS = [
	"titles",
	"messages",
	"toolCalls",
	"files",
] as const;

/** The entity kind a single result row came from (drives the RU kind label). */
export type SearchEntityKind =
	| "knowledge"
	| "note"
	| "journal"
	| "message"
	| "task"
	| "file";

/** Which facet an entity kind rolls up into. */
export const ENTITY_KIND_FACET: Record<SearchEntityKind, SearchFacet> = {
	knowledge: "titles",
	note: "titles",
	journal: "titles",
	message: "messages",
	task: "toolCalls",
	file: "files",
};

/** A single search hit, entity-agnostic (the router maps every source to this). */
export interface SearchResult {
	id: string;
	kind: SearchEntityKind;
	facet: SearchFacet;
	/** Primary display line (doc title, task title, file name, message author …). */
	title: string;
	/** `ts_headline` snippet with `[[hl]]…[[/hl]]` markers, or null. */
	snippet: string | null;
	/** FTS relevance (`ts_rank`); higher = better. Used only for ordering. */
	score: number;
	/** Stable secondary key for deterministic ordering / navigation. */
	updatedAt: string;
}

/** Per-facet match counts (independent of the page LIMIT). */
export type SearchFacetCounts = Record<SearchFacet, number>;

/** The full router response: ranked results + per-facet counts. */
export interface SearchResponse {
	results: SearchResult[];
	facetCounts: SearchFacetCounts;
}
