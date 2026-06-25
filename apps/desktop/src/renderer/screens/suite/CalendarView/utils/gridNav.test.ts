import { describe, expect, it } from "bun:test";
import { isGridNavKey, nextGridIndex } from "./gridNav";

// The month grid is the canonical case: 42 cells, 7 columns (Mon..Sun).
const MONTH = { count: 42, columns: 7 };

describe("isGridNavKey", () => {
	it("accepts the arrow / Home / End / Page keys", () => {
		for (const k of [
			"ArrowUp",
			"ArrowDown",
			"ArrowLeft",
			"ArrowRight",
			"Home",
			"End",
			"PageUp",
			"PageDown",
		]) {
			expect(isGridNavKey(k)).toBe(true);
		}
	});

	it("rejects unrelated keys", () => {
		for (const k of ["Enter", "Escape", "a", "Tab", " "]) {
			expect(isGridNavKey(k)).toBe(false);
		}
	});
});

describe("nextGridIndex — arrows in a 7-wide month grid", () => {
	it("moves right within a row", () => {
		expect(nextGridIndex("ArrowRight", { current: 0, ...MONTH })).toBe(1);
	});

	it("does not wrap past the right edge", () => {
		// Index 6 is the last column of row 0.
		expect(nextGridIndex("ArrowRight", { current: 6, ...MONTH })).toBe(6);
	});

	it("moves left within a row", () => {
		expect(nextGridIndex("ArrowLeft", { current: 5, ...MONTH })).toBe(4);
	});

	it("does not wrap past the left edge", () => {
		expect(nextGridIndex("ArrowLeft", { current: 7, ...MONTH })).toBe(7);
	});

	it("moves down one full week", () => {
		expect(nextGridIndex("ArrowDown", { current: 0, ...MONTH })).toBe(7);
	});

	it("clamps Down at the bottom row", () => {
		// Row 5 (indices 35..41) is the last; Down stays put.
		expect(nextGridIndex("ArrowDown", { current: 38, ...MONTH })).toBe(38);
	});

	it("moves up one full week", () => {
		expect(nextGridIndex("ArrowUp", { current: 14, ...MONTH })).toBe(7);
	});

	it("clamps Up at the top row", () => {
		expect(nextGridIndex("ArrowUp", { current: 3, ...MONTH })).toBe(3);
	});
});

describe("nextGridIndex — Home / End / Page", () => {
	it("Home goes to the start of the current row", () => {
		expect(nextGridIndex("Home", { current: 11, ...MONTH })).toBe(7);
	});

	it("End goes to the end of the current row", () => {
		expect(nextGridIndex("End", { current: 8, ...MONTH })).toBe(13);
	});

	it("PageUp jumps to the same column in the top row", () => {
		expect(nextGridIndex("PageUp", { current: 23, ...MONTH })).toBe(2);
	});

	it("PageDown jumps to the same column in the bottom row", () => {
		expect(nextGridIndex("PageDown", { current: 2, ...MONTH })).toBe(37);
	});
});

describe("nextGridIndex — single-row strip (time grid week, 7 cols / 7 cells)", () => {
	const WEEK = { count: 7, columns: 7 };

	it("left/right move between day columns", () => {
		expect(nextGridIndex("ArrowRight", { current: 0, ...WEEK })).toBe(1);
		expect(nextGridIndex("ArrowLeft", { current: 6, ...WEEK })).toBe(5);
	});

	it("up/down stay put with a single row", () => {
		expect(nextGridIndex("ArrowDown", { current: 3, ...WEEK })).toBe(3);
		expect(nextGridIndex("ArrowUp", { current: 3, ...WEEK })).toBe(3);
	});

	it("day view (1 cell) never moves", () => {
		const DAY = { count: 1, columns: 1 };
		expect(nextGridIndex("ArrowRight", { current: 0, ...DAY })).toBe(0);
		expect(nextGridIndex("ArrowDown", { current: 0, ...DAY })).toBe(0);
	});
});

describe("nextGridIndex — guards", () => {
	it("returns null for non-nav keys", () => {
		expect(nextGridIndex("Enter", { current: 0, ...MONTH })).toBeNull();
	});

	it("returns null for an empty grid", () => {
		expect(
			nextGridIndex("ArrowRight", { current: 0, count: 0, columns: 7 }),
		).toBeNull();
	});

	it("clamps an out-of-range current index", () => {
		expect(nextGridIndex("ArrowRight", { current: 99, ...MONTH })).toBe(41);
	});
});
