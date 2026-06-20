import { describe, expect, test } from "bun:test";
import type { SelectV2Workspace } from "@rox/db/schema";
import { selectWorkspacesByProject } from "./selectWorkspacesByProject";

function ws(id: string, projectId: string, createdAt: Date): SelectV2Workspace {
	return {
		id,
		organizationId: "org-1",
		projectId,
		hostId: "host-1",
		name: id,
		branch: `feature/${id}`,
		type: "worktree",
		createdByUserId: null,
		taskId: null,
		createdAt,
		updatedAt: createdAt,
	} as SelectV2Workspace;
}

describe("selectWorkspacesByProject", () => {
	const rows = [
		ws("a", "p1", new Date("2026-01-01")),
		ws("b", "p2", new Date("2026-01-02")),
		ws("c", "p1", new Date("2026-01-03")),
	];

	test("returns only the project's workspaces", () => {
		const result = selectWorkspacesByProject(rows, "p1");
		expect(result).toHaveLength(2);
		expect(result.map((w) => w.id)).toEqual(["c", "a"]);
	});

	test("sorts newest first", () => {
		const result = selectWorkspacesByProject(rows, "p1");
		expect(result[0]?.id).toBe("c");
	});

	test("returns empty for unknown project or empty input", () => {
		expect(selectWorkspacesByProject(rows, "zzz")).toEqual([]);
		expect(selectWorkspacesByProject(undefined, "p1")).toEqual([]);
		expect(selectWorkspacesByProject([], "p1")).toEqual([]);
	});
});
