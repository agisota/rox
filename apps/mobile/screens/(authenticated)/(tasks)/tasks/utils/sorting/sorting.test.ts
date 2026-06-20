import { describe, expect, test } from "bun:test";
import type { SelectTask, SelectTaskStatus } from "@rox/db/schema";
import { compareTasks } from "./sorting";

function status(
	type: SelectTaskStatus["type"],
	position = 0,
): SelectTaskStatus {
	return {
		id: `s-${type}-${position}`,
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

function task(
	id: string,
	s: SelectTaskStatus,
	priority: SelectTask["priority"] = "none",
): SelectTask & { status: SelectTaskStatus } {
	return {
		id,
		slug: id,
		title: id,
		priority,
		status: s,
	} as SelectTask & { status: SelectTaskStatus };
}

describe("compareTasks", () => {
	test("orders by status type (started before backlog before done)", () => {
		const arr = [
			task("done", status("completed")),
			task("backlog", status("backlog")),
			task("active", status("started")),
		];
		arr.sort(compareTasks);
		expect(arr.map((t) => t.id)).toEqual(["active", "backlog", "done"]);
	});

	test("within a status type, orders by position then priority", () => {
		const s0 = status("started", 0);
		const s1 = status("started", 1);
		const arr = [
			task("b", s1, "urgent"),
			task("a", s0, "low"),
			task("c", s0, "urgent"),
		];
		arr.sort(compareTasks);
		// s0 group first (a,c by priority urgent<low), then s1 group (b)
		expect(arr.map((t) => t.id)).toEqual(["c", "a", "b"]);
	});
});
