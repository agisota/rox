import { workspaceTrpc } from "@rox/workspace-client";
import {
	mapFileSearchResults,
	type WorkspaceFileSearchResult,
} from "./mapFileSearchResults";

const SEARCH_LIMIT = 20;

export interface UseWorkspaceFileSearchResult {
	results: WorkspaceFileSearchResult[];
	isFetching: boolean;
}

/**
 * Workspace-scoped fuzzy file search for the chat @mention popover.
 *
 * Wraps the host-service `filesystem.searchFiles` procedure, which walks the
 * workspace root via fast-glob, ignores `.git`/`node_modules`/build dirs, never
 * follows symlinks out of the root, and returns a bounded, fuzzy-ranked result
 * set. The query is gated on a non-empty `workspaceId` and a non-empty query so
 * an idle composer issues no requests; the caller is expected to pass an
 * already-debounced query.
 */
export function useWorkspaceFileSearch(
	workspaceId: string,
	query: string,
): UseWorkspaceFileSearchResult {
	const trimmedQuery = query.trim();
	const enabled = workspaceId.length > 0 && trimmedQuery.length > 0;

	const { data, isFetching } = workspaceTrpc.filesystem.searchFiles.useQuery(
		{
			workspaceId,
			query: trimmedQuery,
			includeHidden: false,
			limit: SEARCH_LIMIT,
		},
		{
			enabled,
			staleTime: 1000,
			placeholderData: (previous) => previous ?? { matches: [] },
		},
	);

	return {
		results: enabled ? mapFileSearchResults(data?.matches) : [],
		isFetching: enabled && isFetching,
	};
}
