import { describe, expect, it } from "bun:test";
import { buildMonthGrid, isoDateKey, shiftMonth } from "./monthGrid";

describe("buildMonthGrid", () => {
	it("always yields 42 cells (6 weeks)", () => {
		const grid = buildMonthGrid(new Date("2026-06-15T00:00:00Z"));
		expect(grid.cells).toHaveLength(42);
	});

	it("starts on the Monday on/before the 1st", () => {
		// June 2026: the 1st is a Monday, so the first cell is June 1.
		const grid = buildMonthGrid(new Date("2026-06-15T00:00:00Z"));
		expect(grid.cells[0]?.key).toBe("2026-06-01");
		expect(grid.cells[0]?.inMonth).toBe(true);
	});

	it("marks spill-over days from adjacent months as out-of-month", () => {
		// July 2026: the 1st is a Wednesday → grid starts Mon June 29.
		const grid = buildMonthGrid(new Date("2026-07-10T00:00:00Z"));
		expect(grid.cells[0]?.key).toBe("2026-06-29");
		expect(grid.cells[0]?.inMonth).toBe(false);
		const july1 = grid.cells.find((c) => c.key === "2026-07-01");
		expect(july1?.inMonth).toBe(true);
	});

	it("exposes a [rangeStart, rangeEnd) covering all 42 cells", () => {
		const grid = buildMonthGrid(new Date("2026-06-15T00:00:00Z"));
		expect(isoDateKey(grid.rangeStart)).toBe(grid.cells[0]?.key);
		const lastCell = grid.cells[41];
		const dayAfterLast = new Date(grid.rangeEnd);
		dayAfterLast.setUTCDate(dayAfterLast.getUTCDate() - 1);
		expect(isoDateKey(dayAfterLast)).toBe(lastCell?.key);
	});
});

describe("shiftMonth", () => {
	it("steps forward and back across a year boundary", () => {
		const dec = new Date("2026-12-15T00:00:00Z");
		expect(shiftMonth(dec, 1).toISOString().slice(0, 7)).toBe("2027-01");
		const jan = new Date("2026-01-15T00:00:00Z");
		expect(shiftMonth(jan, -1).toISOString().slice(0, 7)).toBe("2025-12");
	});
});
