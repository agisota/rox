import { describe, expect, test } from "bun:test";

import {
	type BoardCardRow,
	type BoardStatus,
	countBoardCards,
	groupTasksByStatus,
	priorityLabel,
	UNGROUPED_COLUMN_ID,
} from "./issue-board";

/**
 * The issue board groups REAL tasks (`task.list`) into REAL status columns
 * (`task.statuses.list`). These tests pin the pure grouping contract the panel
 * depends on — no React, no DB, no migration. This is an org-wide status board;
 * project scoping is intentionally absent (tasks carry no `v2_project_id` and are
 * not mirrored into the entities graph, so there is no real link to filter on).
 */

function status(over: Partial<BoardStatus> & { id: string }): BoardStatus {
	return {
		name: over.id,
		color: "#000000",
		type: "unstarted",
		position: 0,
		...over,
	};
}

function card(
	over: Partial<BoardCardRow["task"]> & { id: string; statusId: string },
): BoardCardRow {
	return {
		task: {
			slug: over.id,
			title: `Task ${over.id}`,
			priority: "none",
			...over,
		},
		assignee: null,
		creator: null,
		statusName: null,
	};
}

describe("groupTasksByStatus", () => {
	test("groups cards under their status and preserves position order", () => {
		const statuses = [
			status({ id: "s_done", name: "Готово", type: "completed", position: 3 }),
			status({
				id: "s_todo",
				name: "К работе",
				type: "unstarted",
				position: 1,
			}),
			status({ id: "s_doing", name: "В работе", type: "started", position: 2 }),
		];
		const cards = [
			card({ id: "t1", statusId: "s_todo" }),
			card({ id: "t2", statusId: "s_doing" }),
			card({ id: "t3", statusId: "s_todo" }),
			card({ id: "t4", statusId: "s_done" }),
		];

		const columns = groupTasksByStatus(statuses, cards);

		// Ordered by position regardless of input order.
		expect(columns.map((c) => c.id)).toEqual(["s_todo", "s_doing", "s_done"]);
		expect(columns[0]?.name).toBe("К работе");
		expect(columns[0]?.cards.map((c) => c.id)).toEqual(["t1", "t3"]);
		expect(columns[1]?.cards.map((c) => c.id)).toEqual(["t2"]);
		expect(columns[2]?.cards.map((c) => c.id)).toEqual(["t4"]);
	});

	test("keeps a status with no cards as an empty column (real board state)", () => {
		const columns = groupTasksByStatus(
			[status({ id: "s_empty", position: 0 })],
			[],
		);
		expect(columns).toHaveLength(1);
		expect(columns[0]?.id).toBe("s_empty");
		expect(columns[0]?.cards).toEqual([]);
	});

	test("collects cards with an unknown status into a trailing fallback column", () => {
		const columns = groupTasksByStatus(
			[status({ id: "s_known", position: 0 })],
			[
				card({ id: "t1", statusId: "s_known" }),
				card({ id: "t_orphan", statusId: "s_missing" }),
			],
		);
		expect(columns.map((c) => c.id)).toEqual(["s_known", UNGROUPED_COLUMN_ID]);
		expect(columns[1]?.cards.map((c) => c.id)).toEqual(["t_orphan"]);
	});

	test("adds NO fallback column when every card has a known status", () => {
		const columns = groupTasksByStatus(
			[status({ id: "s_known", position: 0 })],
			[card({ id: "t1", statusId: "s_known" })],
		);
		expect(columns).toHaveLength(1);
		expect(columns.some((c) => c.id === UNGROUPED_COLUMN_ID)).toBe(false);
	});

	test("maps card presentation fields (title, RU priority, assignee)", () => {
		const columns = groupTasksByStatus(
			[status({ id: "s", position: 0 })],
			[
				{
					task: {
						id: "t1",
						slug: "fix-login",
						title: "Починить вход",
						statusId: "s",
						priority: "high",
					},
					assignee: { id: "u1", name: "Марк", image: "http://x/a.png" },
					creator: null,
					statusName: "В работе",
				},
			],
		);
		const c = columns[0]?.cards[0];
		expect(c?.title).toBe("Починить вход");
		expect(c?.priorityLabel).toBe("Высокий");
		expect(c?.assigneeName).toBe("Марк");
		expect(c?.assigneeImage).toBe("http://x/a.png");
	});
});

describe("countBoardCards", () => {
	test("sums cards across all columns", () => {
		const columns = groupTasksByStatus(
			[status({ id: "a", position: 0 }), status({ id: "b", position: 1 })],
			[
				card({ id: "t1", statusId: "a" }),
				card({ id: "t2", statusId: "a" }),
				card({ id: "t3", statusId: "b" }),
			],
		);
		expect(countBoardCards(columns)).toBe(3);
	});
});

describe("priorityLabel", () => {
	test("known priorities map to RU labels", () => {
		expect(priorityLabel("urgent")).toBe("Срочно");
		expect(priorityLabel("none")).toBe("Без приоритета");
	});
	test("unknown priority passes through", () => {
		expect(priorityLabel("weird")).toBe("weird");
	});
});
