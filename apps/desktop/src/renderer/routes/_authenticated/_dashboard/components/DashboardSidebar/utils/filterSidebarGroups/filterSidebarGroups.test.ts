import { describe, expect, test } from "bun:test";
import type {
	DashboardSidebarProject,
	DashboardSidebarWorkspace,
} from "../../types";
import { filterSidebarGroups } from "./filterSidebarGroups";

function ws(
	id: string,
	name: string,
	labels: string[] = [],
): DashboardSidebarWorkspace {
	return {
		id,
		projectId: "p",
		hostId: "h",
		hostType: "local-device",
		type: "worktree",
		hostIsOnline: null,
		accentColor: null,
		labels,
		name,
		branch: name,
		pullRequest: null,
		repoUrl: null,
		branchExistsOnRemote: false,
		previewUrl: null,
		needsRebase: null,
		behindCount: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		taskId: null,
		pendingTransaction: null,
	};
}

const groups: DashboardSidebarProject[] = [
	{
		id: "p",
		name: "Proj",
		slug: "proj",
		githubRepositoryId: null,
		githubOwner: null,
		githubRepoName: null,
		iconUrl: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		isCollapsed: false,
		children: [
			{ type: "workspace", workspace: ws("a", "feat-login", ["cicd"]) },
			{ type: "workspace", workspace: ws("b", "hotfix", ["bug"]) },
			{
				type: "section",
				section: {
					id: "s",
					projectId: "p",
					name: "Group",
					createdAt: new Date(0),
					isCollapsed: false,
					tabOrder: 0,
					color: null,
					workspaces: [ws("c", "release", ["cicd"])],
				},
			},
		],
	},
];

describe("filterSidebarGroups", () => {
	test("empty query returns the input unchanged", () => {
		expect(filterSidebarGroups(groups, "")).toBe(groups);
		expect(filterSidebarGroups(groups, "   ")).toBe(groups);
	});

	test("filters branches by label across top-level and sections", () => {
		const filtered = filterSidebarGroups(groups, "cicd");
		const ids = filtered[0]?.children.flatMap((child) =>
			child.type === "workspace"
				? [child.workspace.id]
				: child.section.workspaces.map((workspace) => workspace.id),
		);
		expect(ids).toEqual(["a", "c"]);
	});

	test("matches branch name too", () => {
		const filtered = filterSidebarGroups(groups, "hotfix");
		expect(filtered[0]?.children).toHaveLength(1);
	});

	test("drops projects and sections with no match", () => {
		expect(filterSidebarGroups(groups, "nomatch")).toEqual([]);
	});

	test("is case-insensitive", () => {
		expect(filterSidebarGroups(groups, "CICD")[0]?.children).toHaveLength(2);
	});
});
