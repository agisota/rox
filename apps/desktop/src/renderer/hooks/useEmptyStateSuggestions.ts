import type { EmptyStateSurface, StarterPrompt } from "@rox/trpc/suggestions";
import { useQuery } from "@tanstack/react-query";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";

/**
 * F57 (#650) — fetch AI-seeded starter prompts for a shared `EmptyState`.
 *
 * Thin wrapper over the shared `suggestions.forSurface` cloud endpoint so every
 * desktop empty state (chat / drive / tab) seeds its chips from the same single
 * backend the web/mobile surfaces will call. Persona/workspace context is
 * passed through verbatim (F21/F25) to tint the copy; both are optional.
 *
 * The hook never blocks the empty state: while it loads, `isLoading` lets the
 * primitive show skeleton chips, and a failed/absent fetch simply yields no
 * seeded chips (the surface's own static actions still render).
 */
export interface UseEmptyStateSuggestionsArgs {
	surface: EmptyStateSurface;
	personaName?: string | null;
	workspaceName?: string | null;
	/** Skip the query (e.g. the surface is not actually empty). */
	enabled?: boolean;
}

export interface UseEmptyStateSuggestionsResult {
	suggestions: StarterPrompt[];
	isLoading: boolean;
}

export function useEmptyStateSuggestions({
	surface,
	personaName,
	workspaceName,
	enabled = true,
}: UseEmptyStateSuggestionsArgs): UseEmptyStateSuggestionsResult {
	const trpc = useTRPC();
	const query = useQuery({
		...trpc.suggestions.forSurface.queryOptions({
			surface,
			personaName: personaName ?? undefined,
			workspaceName: workspaceName ?? undefined,
		}),
		enabled,
		staleTime: 5 * 60 * 1000,
	});

	return {
		suggestions: query.data ?? [],
		isLoading: enabled && query.isLoading,
	};
}
