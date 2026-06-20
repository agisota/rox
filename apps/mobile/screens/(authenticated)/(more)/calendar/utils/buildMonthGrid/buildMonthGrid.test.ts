import { describe, expect, test } from "bun:test";
import {
	buildMonthGrid,
	countOccurrencesByDay,
	shiftMonth,
} from "./buildMonthGrid";

describe("countOccurrencesByDay", () => {
	test("groups occurrences by local day", () => {
		const counts = countOccurrencesByDay([
			{ start: "2026-06-10T09:00:00.000Z" },
			{ start: "2026-06-10T15:00:00.000Z" },
			{ start: "2026-06-11T08:00:00.000Z" },
		]);
		// Two on the 10th, one on the 11th (assuming same local day grouping).
		const total = [...counts.values()].reduce((a, b) => a + b, 0);
		expect(total).toBe(3);
		expect(counts.size >= 2).toBe(true);
	});

	test("skips invalid dates", () => {
		const counts = countOccurrencesByDay([
			{ start: "not-a-date" },
			{ start: "2026-06-10T09:00:00.000Z" },
		]);
		const total = [...counts.values()].reduce((a, b) => a + b, 0);
		expect(total).toBe(1);
	});
});

describe("buildMonthGrid", () => {
	test("always produces a 42-cell (6×7) grid", () => {
		const grid = buildMonthGrid(new Date(2026, 5, 15), []);
		expect(grid.cells).toHaveLength(42);
	});

	test("starts on a Sunday and includes every day of the month", () => {
		const grid = buildMonthGrid(new Date(2026, 5, 1), []);
		expect(grid.cells[0].date.getDay()).toBe(0);
		const inMonthDays = grid.cells
			.filter((c) => c.inMonth)
			.map((c) => c.day)
			.sort((a, b) => a - b);
		// June has 30 days.
		expect(inMonthDays[0]).toBe(1);
		expect(inMonthDays[inMonthDays.length - 1]).toBe(30);
		expect(inMonthDays).toHaveLength(30);
	});

	test("flags spill-over cells as not in-month", () => {
		const grid = buildMonthGrid(new Date(2026, 5, 1), []);
		const spill = grid.cells.filter((c) => !c.inMonth);
		expect(spill.length).toBe(42 - 30);
	});

	test("marks today's cell", () => {
		const today = new Date(2026, 5, 12);
		const grid = buildMonthGrid(new Date(2026, 5, 1), [], today);
		const todayCells = grid.cells.filter((c) => c.isToday);
		expect(todayCells).toHaveLength(1);
		expect(todayCells[0].day).toBe(12);
		expect(todayCells[0].inMonth).toBe(true);
	});

	test("attaches event counts to the right cells", () => {
		const today = new Date(2026, 5, 1);
		const local = new Date(2026, 5, 10, 9, 0, 0);
		const grid = buildMonthGrid(
			new Date(2026, 5, 1),
			[{ start: local.toISOString() }],
			today,
		);
		const cell = grid.cells.find((c) => c.inMonth && c.day === 10);
		expect(cell?.eventCount).toBe(1);
	});

	test("builds a localized title", () => {
		const grid = buildMonthGrid(new Date(2026, 5, 1), []);
		expect(grid.title).toContain("2026");
	});
});

describe("shiftMonth", () => {
	test("steps forward and back across year boundaries", () => {
		const dec = new Date(2026, 11, 1);
		const jan = shiftMonth(dec, 1);
		expect(jan.getFullYear()).toBe(2027);
		expect(jan.getMonth()).toBe(0);

		const nov = shiftMonth(dec, -1);
		expect(nov.getMonth()).toBe(10);
		expect(nov.getFullYear()).toBe(2026);
	});

	test("normalizes to the first of the month", () => {
		const mid = new Date(2026, 5, 17);
		expect(shiftMonth(mid, 0).getDate()).toBe(1);
	});
});
