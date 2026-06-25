import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import type { WorkspaceSurface } from "@/hooks/useClaudeSession/selectClaudeSession";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { selectTerminalStatus } from "./selectTerminalStatus";

export interface UseTerminalStatusResult extends WorkspaceSurface {
	/** True once the terminals collection has reported its first sync. */
	isReady: boolean;
}

/**
 * Live terminal status for a workspace (FN-055 foundation, FN-087 live data).
 * Cache-first, sharing the {@link WorkspaceSurface} contract and the shared
 * status model with {@link useClaudeSession} so both cards behave identically.
 */
export function useTerminalStatus(
	workspaceId: string,
): UseTerminalStatusResult {
	const collections = useCollections();

	const { data, isReady } = useLiveQuery(
		(q) => q.from({ terminals: collections.terminals }),
		[collections],
	);

	const surface = useMemo(
		() => selectTerminalStatus(data, workspaceId, { isConnecting: !isReady }),
		[data, workspaceId, isReady],
	);

	return { ...surface, isReady };
}
