import type { SelectProject } from "@rox/db/schema";

/**
 * "owner/name" label for a project's repo, or null when either part is missing.
 */
export function repoLabel(project: {
	repoOwner: string;
	repoName: string;
}): string | null {
	const owner = project.repoOwner?.trim();
	const name = project.repoName?.trim();
	if (!owner || !name) return null;
	return `${owner}/${name}`;
}

/**
 * Alphabetical (case-insensitive) project sort. Returns a new array.
 */
export function sortProjects(projects: SelectProject[]): SelectProject[] {
	return [...projects].sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
	);
}
