import type { AppRouter } from "@rox/host-service";
import type { inferRouterOutputs } from "@trpc/server";

type FileSearchMatch =
	inferRouterOutputs<AppRouter>["filesystem"]["searchFiles"]["matches"][number];

export interface WorkspaceFileSearchResult {
	/** Stable identity for list keys — the absolute on-disk path. */
	id: string;
	/** Bare file name (basename) for display. */
	name: string;
	/** Workspace-root-relative path that gets inserted as the @mention. */
	relativePath: string;
}

/**
 * Maps the host-service `filesystem.searchFiles` matches into the minimal shape
 * the mention popover renders. Kept as a pure function so the mapping (and the
 * workspace-scoping guarantee that each result is addressed by its absolute
 * path) is unit-testable without a tRPC/React harness.
 */
export function mapFileSearchResults(
	matches: readonly FileSearchMatch[] | undefined,
): WorkspaceFileSearchResult[] {
	if (!matches) return [];
	return matches.map((match) => ({
		id: match.absolutePath,
		name: match.name,
		relativePath: match.relativePath,
	}));
}
