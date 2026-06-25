import { describe, expect, test } from "bun:test";
import {
	buildWorkspaceFuse,
	flattenProjectGroups,
	fuzzyFilter,
} from "./listModel";
import type { ProjectGroup, WorkspaceItem } from "./types";

function item(
	partial: Partial<WorkspaceItem> & { uniqueId: string },
): WorkspaceItem {
	return {
		workspaceId: partial.uniqueId,
		worktreeId: null,
		projectId: "p1",
		projectName: "Rox",
		worktreePath: "/tmp/x",
		type: "branch",
		branch: "main",
		name: "workspace",
		lastOpenedAt: 0,
		createdAt: 0,
		isUnread: false,
		isOpen: true,
		...partial,
	};
}

describe("flattenProjectGroups", () => {
	test("emits a header before each project's rows", () => {
		const groups: ProjectGroup[] = [
			{
				projectId: "p1",
				projectName: "Rox",
				workspaces: [item({ uniqueId: "a" }), item({ uniqueId: "b" })],
			},
			{
				projectId: "p2",
				projectName: "Set",
				workspaces: [
					item({ uniqueId: "c", projectId: "p2", projectName: "Set" }),
				],
			},
		];
		const flat = flattenProjectGroups(groups);
		expect(flat.map((r) => r.kind)).toEqual([
			"header",
			"row",
			"row",
			"header",
			"row",
		]);
		expect(flat[0]).toMatchObject({
			kind: "header",
			projectName: "Rox",
			count: 2,
		});
		expect(flat[3]).toMatchObject({
			kind: "header",
			projectName: "Set",
			count: 1,
		});
	});

	test("empty input → empty stream", () => {
		expect(flattenProjectGroups([])).toEqual([]);
	});
});

describe("fuzzyFilter", () => {
	const items = [
		item({ uniqueId: "a", name: "feature-auth", branch: "feat/auth" }),
		item({ uniqueId: "b", name: "bugfix-login", branch: "fix/login" }),
		item({ uniqueId: "c", name: "marketplace", projectName: "Templates" }),
	];

	test("blank query returns input order untouched", () => {
		const fuse = buildWorkspaceFuse(items);
		expect(fuzzyFilter(fuse, items, "   ")).toEqual(items);
	});

	test("matches by name with typo tolerance", () => {
		const fuse = buildWorkspaceFuse(items);
		const hits = fuzzyFilter(fuse, items, "lgin");
		expect(hits[0]?.uniqueId).toBe("b");
	});

	test("matches by project name", () => {
		const fuse = buildWorkspaceFuse(items);
		const hits = fuzzyFilter(fuse, items, "templates");
		expect(hits.map((h) => h.uniqueId)).toContain("c");
	});
});
