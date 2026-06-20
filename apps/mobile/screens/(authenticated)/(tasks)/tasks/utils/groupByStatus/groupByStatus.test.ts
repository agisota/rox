import { describe, expect, test } from "bun:test";
import type { SelectTask, SelectTaskStatus, SelectUser } from "@rox/db/schema";
import { groupByStatus } from "./groupByStatus";

type TaskWithStatus = SelectTask & {
	status: SelectTaskStatus;
	assignee: SelectUser | null;
};

function makeStatus(
	id: string,
	type: SelectTaskStatus["type"],
	position = 0,
): SelectTaskStatus {
	return {
		id,
		organizationId: "org-1",
		name: type,
		color: "#000000",
		type,
		position,
		progressPercent: null,
		externalProvider: null,
		externalId: null,
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
	} as SelectTaskStatus;
}

function makeTask(
	id: string,
	status: SelectTaskStatus,
	overrides: Partial<TaskWithStatus> = {},
): TaskWithStatus {
	return {
		id,
		slug: `task-${id}`,
		title: `Task ${id}`,
		description: null,
		statusId: status.id,
		priority: "none",
		assigneeId: null,
		dueDate: null,
		labels: [],
		branch: null,
		prUrl: null,
		externalKey: null,
		deletedAt: null,
		status,
		assignee: null,
		...overrides,
	} as TaskWithStatus;
}

describe("groupByStatus", () => {
	test("returns sections in canonical workflow order", () => {
		const completed = makeStatus("s-completed", "completed");
		const backlog = makeStatus("s-backlog", "backlog");
		const started = makeStatus("s-started", "started");
		const unstarted = makeStatus("s-unstarted", "unstarted");
		const canceled = makeStatus("s-canceled", "canceled");

		const sections = groupByStatus([
			makeTask("1", completed),
			makeTask("2", backlog),
			makeTask("3", started),
			makeTask("4", unstarted),
			makeTask("5", canceled),
		]);

		expect(sections.map((s) => s.type)).toEqual([
			"backlog",
			"unstarted",
			"started",
			"completed",
			"canceled",
		]);
	});

	test("filters out soft-deleted tasks", () => {
		const backlog = makeStatus("s-backlog", "backlog");
		const sections = groupByStatus([
			makeTask("1", backlog),
			makeTask("2", backlog, { deletedAt: new Date("2026-02-01") }),
		]);

		const allTasks = sections.flatMap((s) => s.data);
		expect(allTasks.map((t) => t.id)).toEqual(["1"]);
	});

	test("omits empty sections", () => {
		const backlog = makeStatus("s-backlog", "backlog");
		const sections = groupByStatus([makeTask("1", backlog)]);
		expect(sections).toHaveLength(1);
		expect(sections[0]?.type).toBe("backlog");
	});

	test("groups multiple tasks under the same status type", () => {
		const started = makeStatus("s-started", "started");
		const sections = groupByStatus([
			makeTask("a", started),
			makeTask("b", started),
		]);
		expect(sections).toHaveLength(1);
		expect(sections[0]?.data).toHaveLength(2);
	});

	test("returns no sections for empty input", () => {
		expect(groupByStatus([])).toEqual([]);
	});
});
