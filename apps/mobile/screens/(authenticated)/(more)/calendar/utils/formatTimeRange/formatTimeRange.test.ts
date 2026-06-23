import { describe, expect, test } from "bun:test";
import { formatTimeRange } from "./formatTimeRange";

describe("formatTimeRange", () => {
	test("returns 'All day' for all-day events", () => {
		const d = new Date(2026, 5, 21, 9, 0);
		expect(formatTimeRange(d, d, true)).toBe("All day");
	});

	test("joins start and end times with an en dash", () => {
		const start = new Date(2026, 5, 21, 9, 0);
		const end = new Date(2026, 5, 21, 9, 30);
		const label = formatTimeRange(start, end, false);
		expect(label).toContain("–");
		expect(label.startsWith("All day")).toBe(false);
	});
});
