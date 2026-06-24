/**
 * Web entry point for the unified-search result mapper.
 *
 * The pure mapping (RU kind labels, `rox://` deep links, snippet normalization,
 * default kinds) now lives cross-platform in
 * `@rox/shared/unified-search-results` so the desktop unified-search panel
 * reuses the exact same logic and tests (no duplication). This module is a thin
 * re-export so the web surface and its imports stay unchanged.
 */
export {
	mapUnifiedSearchResults,
	toUnifiedSearchResult,
	UNIFIED_SEARCH_DEFAULT_KINDS,
	type UnifiedSearchHit,
	type UnifiedSearchResultViewModel,
	unifiedSearchHref,
	unifiedSearchKindLabel,
} from "@rox/shared/unified-search-results";
