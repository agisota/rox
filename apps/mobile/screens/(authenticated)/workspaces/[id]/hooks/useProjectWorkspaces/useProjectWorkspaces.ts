import type { SelectV2Workspace } from "@rox/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { selectWorkspacesByProject } from "./selectWorkspacesByProject";

interface UseProjectWorkspacesResult {
	workspaces: SelectV2Workspace[];
	isReady: boolean;
}

/**
 * Live list of v2 workspaces belonging to a project. Cache-first: returns the
 * persisted rows as soon as they are available, even before the collection
 * reports ready.
 */
export function useProjectWorkspaces(
	projectId: string,
): UseProjectWorkspacesResult {
	const collections = useCollections();

	const { data, isReady } = useLiveQuery(
		(q) => q.from({ v2Workspaces: collections.v2Workspaces }),
		[collections],
	);

	const workspaces = useMemo(
		() => selectWorkspacesByProject(data, projectId),
		[data, projectId],
	);

	return { workspaces, isReady };
}
