/**
 * Cross-entity faceted search — pure facet helpers (F16).
 *
 * RU segment labels, empty-count construction, scope→facet eligibility, and the
 * presentational filtering the faceted panel uses. Dependency-free and shared by
 * the search router (count scaffolding) and every platform's panel (labels +
 * filtering), so the behavior is unit-tested once here.
 */

import {
	ENTITY_KIND_FACET,
	SEARCH_FACETS,
	type SearchFacet,
	type SearchFacetCounts,
	type SearchResponse,
	type SearchResult,
	type SearchScopeType,
} from "./types";

/** RU labels for the facet segments (matches `unified-search-results` style). */
export const SEARCH_FACET_LABELS: Record<SearchFacet, string> = {
	titles: "Заголовки",
	messages: "Сообщения",
	toolCalls: "Вызовы инструментов",
	files: "Файлы",
};

/** RU labels for the entity kinds a result row can carry. */
export const SEARCH_KIND_LABELS: Record<SearchResult["kind"], string> = {
	knowledge: "Документ",
	note: "Заметка",
	journal: "Журнал",
	message: "Сообщение",
	task: "Задача",
	file: "Файл",
};

export function searchFacetLabel(facet: SearchFacet): string {
	return SEARCH_FACET_LABELS[facet];
}

export function searchKindLabel(kind: SearchResult["kind"]): string {
	return SEARCH_KIND_LABELS[kind];
}

/** A zeroed `SearchFacetCounts` — the base every count tally starts from. */
export function emptyFacetCounts(): SearchFacetCounts {
	return { titles: 0, messages: 0, toolCalls: 0, files: 0 };
}

/**
 * Which facets a scope can ever yield results for. A `chat` scope only searches
 * messages (the other entities are not session-scoped), so the panel shows just
 * the Messages segment; `project` and `global` span every facet.
 */
export function facetsForScope(scope: SearchScopeType): readonly SearchFacet[] {
	if (scope === "chat") {
		return ["messages"];
	}
	return SEARCH_FACETS;
}

/**
 * Tally per-facet counts from a flat result list. Used as a fallback / for tests;
 * the router computes authoritative counts with SQL `count(*)` per facet so they
 * are independent of the page LIMIT. This counts only what is present.
 */
export function countFacets(
	results: readonly SearchResult[],
): SearchFacetCounts {
	const counts = emptyFacetCounts();
	for (const result of results) {
		counts[result.facet] += 1;
	}
	return counts;
}

/** Map an entity kind to its facet (thin re-export of the canonical table). */
export function facetForKind(kind: SearchResult["kind"]): SearchFacet {
	return ENTITY_KIND_FACET[kind];
}

/**
 * Filter a response's results to a single active facet, or return them all when
 * `active` is null (the "all segments" view). Counts are left untouched so the
 * segment chips keep showing the full per-facet totals while the list narrows.
 */
export function filterResultsByFacet(
	response: SearchResponse,
	active: SearchFacet | null,
): SearchResult[] {
	if (active === null) {
		return response.results;
	}
	return response.results.filter((result) => result.facet === active);
}

/** Total matches across every facet (the "all" segment count). */
export function totalFacetCount(counts: SearchFacetCounts): number {
	return SEARCH_FACETS.reduce((sum, facet) => sum + counts[facet], 0);
}
