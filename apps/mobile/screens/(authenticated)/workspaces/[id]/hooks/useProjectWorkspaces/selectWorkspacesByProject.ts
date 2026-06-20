import type { SelectV2Workspace } from "@rox/db/schema";

/**
 * Filter v2 workspaces down to one project, newest first. Pure so it can be unit
 * tested without instantiating Electric collections.
 */
export function selectWorkspacesByProject(
	workspaces: SelectV2Workspace[] | undefined,
	projectId: string,
): SelectV2Workspace[] {
	if (!workspaces || workspaces.length === 0) return [];
	return workspaces
		.filter((w) => w.projectId === projectId)
		.sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
}

function toTime(value: Date | string | null | undefined): number {
	if (!value) return 0;
	const date = value instanceof Date ? value : new Date(value);
	const time = date.getTime();
	return Number.isNaN(time) ? 0 : time;
}
