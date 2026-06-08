import type { KnowledgeDocumentType } from "@rox/shared/knowledge";
import { useQuery } from "@tanstack/react-query";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

export interface UseKnowledgeDocumentsArgs {
	/** Free-text query; when non-empty the search endpoint is used instead of list. */
	search?: string;
	/** Optional document-type filter applied to both list and search. */
	type?: KnowledgeDocumentType;
}

/**
 * Fetches notebook documents for the active org from the API tRPC router.
 *
 * Knowledge documents are not synced through Electric/TanStack DB, so we read
 * them over the HTTP tRPC client (same path as other API-backed queries in the
 * desktop renderer). A non-empty `search` switches to the `search` endpoint.
 */
export function useKnowledgeDocuments({
	search,
	type,
}: UseKnowledgeDocumentsArgs = {}) {
	const trimmed = search?.trim() ?? "";
	const isSearching = trimmed.length > 0;

	return useQuery({
		queryKey: [
			"knowledge",
			"documents",
			{ search: trimmed, type: type ?? null },
		],
		queryFn: () =>
			isSearching
				? apiTrpcClient.knowledge.search.query({ query: trimmed, type })
				: apiTrpcClient.knowledge.list.query(type ? { type } : undefined),
	});
}
