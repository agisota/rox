import type { SelectProject } from "@rox/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { sortProjects } from "../../utils/projectMeta";

interface UseProjectsDataResult {
	projects: SelectProject[];
	isReady: boolean;
}

/**
 * Live projects for the active organization, sorted alphabetically.
 */
export function useProjectsData(): UseProjectsDataResult {
	const collections = useCollections();

	const { data, isReady } = useLiveQuery(
		(q) => q.from({ projects: collections.projects }),
		[collections],
	);

	const projects = useMemo(() => sortProjects(data ?? []), [data]);

	return { projects, isReady };
}
