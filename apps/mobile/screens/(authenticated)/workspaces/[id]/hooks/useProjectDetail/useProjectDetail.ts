import type { SelectProject } from "@rox/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { selectProjectById } from "./selectProjectById";

interface UseProjectDetailResult {
	project: SelectProject | null;
	isReady: boolean;
}

/**
 * Live detail for a single project by id. Cache-first: returns the persisted
 * row as soon as it is available, even before the collection reports ready.
 */
export function useProjectDetail(id: string): UseProjectDetailResult {
	const collections = useCollections();

	const { data, isReady } = useLiveQuery(
		(q) => q.from({ projects: collections.projects }),
		[collections],
	);

	const project = useMemo(() => selectProjectById(data, id), [data, id]);

	return { project, isReady };
}
