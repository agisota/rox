import { describe, expect, it } from "bun:test";
import {
	computeCropRect,
	DEFAULT_CAPTURE_PADDING,
	expectedImagePixelSize,
	toCaptureBounds,
} from "./bounds";
import type { RawElementDescriptor } from "./types";

const viewport = { width: 1000, height: 800 };

describe("computeCropRect", () => {
	it("pads the element rect and returns integers", () => {
		const crop = computeCropRect(
			{ x: 100, y: 200, width: 50, height: 40 },
			viewport,
		);
		expect(crop).toEqual({
			x: 100 - DEFAULT_CAPTURE_PADDING,
			y: 200 - DEFAULT_CAPTURE_PADDING,
			width: 50 + DEFAULT_CAPTURE_PADDING * 2,
			height: 40 + DEFAULT_CAPTURE_PADDING * 2,
		});
	});

	it("clamps to the viewport edges", () => {
		const crop = computeCropRect(
			{ x: 2, y: 2, width: 20, height: 20 },
			viewport,
			12,
		);
		expect(crop.x).toBe(0);
		expect(crop.y).toBe(0);

		const edge = computeCropRect(
			{ x: 980, y: 780, width: 100, height: 100 },
			viewport,
		);
		expect(edge.x + edge.width).toBeLessThanOrEqual(viewport.width);
		expect(edge.y + edge.height).toBeLessThanOrEqual(viewport.height);
	});

	it("never produces a zero-size crop", () => {
		const crop = computeCropRect(
			{ x: 0, y: 0, width: 0, height: 0 },
			viewport,
			0,
		);
		expect(crop.width).toBeGreaterThanOrEqual(1);
		expect(crop.height).toBeGreaterThanOrEqual(1);
	});
});

describe("expectedImagePixelSize", () => {
	it("scales the crop by the device pixel ratio", () => {
		expect(
			expectedImagePixelSize({ x: 0, y: 0, width: 50, height: 40 }, 3),
		).toEqual({ width: 150, height: 120 });
	});

	it("treats a non-positive dpr as 1", () => {
		expect(
			expectedImagePixelSize({ x: 0, y: 0, width: 10, height: 10 }, 0),
		).toEqual({ width: 10, height: 10 });
	});
});

describe("toCaptureBounds", () => {
	it("carries through rect + viewport + dpr", () => {
		const desc = {
			rect: { x: 5, y: 6, width: 7, height: 8 },
			viewport: { width: 390, height: 844, devicePixelRatio: 3 },
		} as RawElementDescriptor;
		expect(toCaptureBounds(desc)).toEqual({
			x: 5,
			y: 6,
			width: 7,
			height: 8,
			viewportWidth: 390,
			viewportHeight: 844,
			deviceScaleFactor: 3,
		});
	});
});
