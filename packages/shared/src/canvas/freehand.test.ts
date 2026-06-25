import { describe, expect, it } from "bun:test";
import {
	type FreehandPoint,
	freehandPointsToSvgPath,
	getFreehandBounds,
	outlineToSvgPath,
	translateFreehandPoints,
} from "./freehand";

const stroke: FreehandPoint[] = [
	[10, 20, 0.5],
	[14, 26, 0.6],
	[22, 30, 0.4],
	[30, 28, 0.5],
];

describe("getFreehandBounds", () => {
	it("computes the min/max box and dimensions", () => {
		const bounds = getFreehandBounds(stroke);
		expect(bounds.minX).toBe(10);
		expect(bounds.minY).toBe(20);
		expect(bounds.maxX).toBe(30);
		expect(bounds.maxY).toBe(30);
		expect(bounds.width).toBe(20);
		expect(bounds.height).toBe(10);
	});

	it("returns a zero box for an empty stroke", () => {
		const bounds = getFreehandBounds([]);
		expect(bounds).toEqual({
			minX: 0,
			minY: 0,
			maxX: 0,
			maxY: 0,
			width: 0,
			height: 0,
		});
	});
});

describe("translateFreehandPoints", () => {
	it("shifts every point and preserves pressure when present", () => {
		const moved = translateFreehandPoints(stroke, 10, 20);
		expect(moved[0]).toEqual([0, 0, 0.5]);
		expect(moved[3]).toEqual([20, 8, 0.5]);
	});

	it("preserves the 2-tuple shape when no pressure is provided", () => {
		const moved = translateFreehandPoints([[5, 5]], 1, 2);
		expect(moved[0]).toEqual([4, 3]);
	});
});

describe("outlineToSvgPath", () => {
	it("returns an empty string for an empty outline", () => {
		expect(outlineToSvgPath([])).toBe("");
	});

	it("builds a closed quadratic path from outline points", () => {
		const path = outlineToSvgPath([
			[0, 0],
			[10, 0],
			[10, 10],
		]);
		expect(path.startsWith("M 0 0 Q")).toBe(true);
		expect(path.endsWith("Z")).toBe(true);
	});
});

describe("freehandPointsToSvgPath", () => {
	it("returns an empty string for no points", () => {
		expect(freehandPointsToSvgPath([])).toBe("");
	});

	it("smooths samples into a non-empty closed SVG path", () => {
		const path = freehandPointsToSvgPath(stroke);
		expect(path.length).toBeGreaterThan(0);
		expect(path.startsWith("M")).toBe(true);
		expect(path.endsWith("Z")).toBe(true);
	});
});
