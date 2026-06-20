import { describe, expect, test } from "bun:test";
import type { SelectTaskStatus } from "@rox/db/schema";
import type { TaskWithStatus } from "@/screens/(authenticated)/(tasks)/tasks/utils/groupByStatus";
import { firstCompletedStatusId, selectTaskById } from "./selectTaskById";

function status(
	id: string,
	type: SelectTaskStatus["type"],
	position = 0,
): SelectTaskStatus {
	return {
		id,
		organizationId: "org-1",
		name: type,
		color: "#000",
		type,
		position,
		progressPercent: null,
		externalProvider: null,
		externalId: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	} as SelectTaskStatus;
}

function task(id: string, s: SelectTaskStatus): TaskWithStatus {
	return {
		id,
		slug: id,
		title: id,
		statusId: s.id,
		priority: "none",
		status: s,
		assignee: null,
		deletedAt: null,
	} as TaskWithStatus;
}

describe("selectTaskById", () => {
	const backlog = status("s1", "backlog");
	const rows = [task("a", backlog), task("b", backlog)];

	test("returns the matching task", () => {
		expect(selectTaskById(rows, "b")?.id).toBe("b");
	});

	test("returns null for a missing id", () => {
		expect(selectTaskById(rows, "zzz")).toBeNull();
	});

	test("returns null for empty/undefined data", () => {
		expect(selectTaskById(undefined, "a")).toBeNull();
		expect(selectTaskById([], "a")).toBeNull();
	});
});

describe("firstCompletedStatusId", () => {
	test("picks the lowest-position completed status", () => {
		const statuses = [
			status("done-2", "completed", 2),
			status("backlog", "backlog", 0),
			status("done-1", "completed", 1),
		];
		expect(firstCompletedStatusId(statuses)).toBe("done-1");
	});

	test("returns null when no completed status exists", () => {
		expect(firstCompletedStatusId([status("b", "backlog")])).toBeNull();
		expect(firstCompletedStatusId([])).toBeNull();
	});
});
