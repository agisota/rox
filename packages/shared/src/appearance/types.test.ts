import { describe, expect, it } from "bun:test";
import {
	clampWindowOpacity,
	DEFAULT_APPEARANCE_SETTINGS,
	MAX_WINDOW_OPACITY,
	MIN_WINDOW_OPACITY,
} from "./types";

describe("clampWindowOpacity", () => {
	it("passes through in-range values", () => {
		expect(clampWindowOpacity(0.5)).toBe(0.5);
		expect(clampWindowOpacity(MIN_WINDOW_OPACITY)).toBe(MIN_WINDOW_OPACITY);
		expect(clampWindowOpacity(MAX_WINDOW_OPACITY)).toBe(MAX_WINDOW_OPACITY);
	});

	it("clamps out-of-range values to the bounds", () => {
		expect(clampWindowOpacity(-1)).toBe(MIN_WINDOW_OPACITY);
		expect(clampWindowOpacity(0)).toBe(MIN_WINDOW_OPACITY);
		expect(clampWindowOpacity(2)).toBe(MAX_WINDOW_OPACITY);
	});

	it("falls back to the default for NaN", () => {
		expect(clampWindowOpacity(Number.NaN)).toBe(
			DEFAULT_APPEARANCE_SETTINGS.windowOpacity,
		);
	});
});
