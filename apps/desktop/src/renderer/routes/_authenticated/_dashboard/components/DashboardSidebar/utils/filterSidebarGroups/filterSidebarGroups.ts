import type {
	DashboardSidebarProject,
	DashboardSidebarProjectChild,
	DashboardSidebarWorkspace,
} from "../../types";

function workspaceMatches(
	workspace: DashboardSidebarWorkspace,
	query: string,
): boolean {
	const haystack = [workspace.name, workspace.branch, ...workspace.labels]
		.join(" ")
		.toLowerCase();
	return haystack.includes(query);
}

/**
 * Narrow sidebar groups to branches whose name, branch, or labels match the
 * query (case-insensitive substring). An empty/whitespace query returns the
 * input unchanged (same reference). Sections and projects left with no matching
 * branch are dropped, so the sidebar shows only the relevant subtree.
 */
export function filterSidebarGroups(
	groups: DashboardSidebarProject[],
	query: string,
): DashboardSidebarProject[] {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return groups;

	const result: DashboardSidebarProject[] = [];
	for (const project of groups) {
		const children: DashboardSidebarProjectChild[] = [];
		for (const child of project.children) {
			if (child.type === "workspace") {
				if (workspaceMatches(child.workspace, normalized)) children.push(child);
				continue;
			}
			const workspaces = child.section.workspaces.filter((workspace) =>
				workspaceMatches(workspace, normalized),
			);
			if (workspaces.length > 0) {
				children.push({
					type: "section",
					section: { ...child.section, workspaces },
				});
			}
		}
		if (children.length > 0) result.push({ ...project, children });
	}
	return result;
}
