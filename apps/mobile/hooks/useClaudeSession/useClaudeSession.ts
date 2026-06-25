import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import {
	selectClaudeSession,
	type WorkspaceSurface,
} from "./selectClaudeSession";

export interface UseClaudeSessionResult extends WorkspaceSurface {
	/** True once the durable_sessions collection has reported its first sync. */
	isReady: boolean;
}

/**
 * Live Claude session status for a workspace (FN-055 foundation, FN-087 live
 * data). Cache-first: returns the persisted row's status as soon as it is
 * available, and reports `connecting` while the collection's first snapshot is
 * still loading. The status vocabulary + lifecycle->badge mapping live in
 * `@rox/shared/workspace-status`, shared with web/desktop.
 */
export function useClaudeSession(workspaceId: string): UseClaudeSessionResult {
	const collections = useCollections();

	const { data, isReady } = useLiveQuery(
		(q) => q.from({ durableSessions: collections.durableSessions }),
		[collections],
	);

	const surface = useMemo(
		() => selectClaudeSession(data, workspaceId, { isConnecting: !isReady }),
		[data, workspaceId, isReady],
	);

	return { ...surface, isReady };
}
