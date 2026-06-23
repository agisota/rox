import { describe, expect, it } from "bun:test";
import {
	addMonths,
	dayKey,
	monthRange,
	startOfMonth,
	startOfNextMonth,
} from "./monthRange";

describe("monthRange helpers", () => {
	it("startOfMonth returns the first instant of the month", () => {
		const result = startOfMonth(new Date(2026, 5, 22, 14, 30, 12, 500));
		expect(result.getFullYear()).toBe(2026);
		expect(result.getMonth()).toBe(5);
		expect(result.getDate()).toBe(1);
		expect(result.getHours()).toBe(0);
		expect(result.getMinutes()).toBe(0);
		expect(result.getSeconds()).toBe(0);
		expect(result.getMilliseconds()).toBe(0);
	});

	it("startOfNextMonth rolls into the following month", () => {
		const result = startOfNextMonth(new Date(2026, 5, 22));
		expect(result.getMonth()).toBe(6);
		expect(result.getDate()).toBe(1);
	});

	it("startOfNextMonth rolls the year over in December", () => {
		const result = startOfNextMonth(new Date(2026, 11, 15));
		expect(result.getFullYear()).toBe(2027);
		expect(result.getMonth()).toBe(0);
	});

	it("monthRange produces a half-open window of exactly one month", () => {
		const { start, end } = monthRange(new Date(2026, 1, 10));
		expect(start.getMonth()).toBe(1);
		expect(start.getDate()).toBe(1);
		expect(end.getMonth()).toBe(2);
		expect(end.getDate()).toBe(1);
		expect(end.getTime()).toBeGreaterThan(start.getTime());
	});

	it("addMonths moves forward and backward across year boundaries", () => {
		expect(addMonths(new Date(2026, 0, 15), -1).getMonth()).toBe(11);
		expect(addMonths(new Date(2026, 0, 15), -1).getFullYear()).toBe(2025);
		expect(addMonths(new Date(2026, 11, 1), 1).getFullYear()).toBe(2027);
	});

	it("dayKey produces a zero-padded YYYY-MM-DD string", () => {
		expect(dayKey(new Date(2026, 0, 3))).toBe("2026-01-03");
		expect(dayKey(new Date(2026, 11, 25))).toBe("2026-12-25");
	});
});
