import type { SelectProject } from "@rox/db/schema";

/**
 * Pick a single project by id from a live-query result. Null when absent.
 */
export function selectProjectById(
	projects: SelectProject[] | undefined,
	id: string,
): SelectProject | null {
	if (!projects || projects.length === 0) return null;
	return projects.find((p) => p.id === id) ?? null;
}
