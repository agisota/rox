import { describe, expect, test } from "bun:test";
import { buildActivityData, levelForCount } from "./buildActivityData";

describe("levelForCount", () => {
	test("maps counts to 0–4 intensity buckets", () => {
		expect(levelForCount(0)).toBe(0);
		expect(levelForCount(1)).toBe(1);
		expect(levelForCount(2)).toBe(1);
		expect(levelForCount(3)).toBe(2);
		expect(levelForCount(5)).toBe(2);
		expect(levelForCount(6)).toBe(3);
		expect(levelForCount(10)).toBe(3);
		expect(levelForCount(11)).toBe(4);
		expect(levelForCount(99)).toBe(4);
	});

	test("clamps negative counts to 0", () => {
		expect(levelForCount(-5)).toBe(0);
	});
});

describe("buildActivityData", () => {
	const now = new Date("2026-06-25T12:00:00.000Z");

	test("returns a contiguous trailing window, oldest first", () => {
		const data = buildActivityData([], 7, now);
		expect(data).toHaveLength(7);
		expect(data[0]?.date).toBe("2026-06-19");
		expect(data[6]?.date).toBe("2026-06-25");
		expect(data.every((d) => d.count === 0 && d.level === 0)).toBe(true);
	});

	test("counts timestamps per UTC calendar day", () => {
		const data = buildActivityData(
			[
				"2026-06-25T01:00:00.000Z",
				"2026-06-25T23:30:00.000Z",
				"2026-06-24T08:00:00.000Z",
			],
			3,
			now,
		);
		const byDay = Object.fromEntries(data.map((d) => [d.date, d]));
		expect(byDay["2026-06-25"]?.count).toBe(2);
		expect(byDay["2026-06-25"]?.level).toBe(1);
		expect(byDay["2026-06-24"]?.count).toBe(1);
		expect(byDay["2026-06-23"]?.count).toBe(0);
	});

	test("ignores activity outside the window", () => {
		const data = buildActivityData(["2020-01-01T00:00:00.000Z"], 3, now);
		expect(data.every((d) => d.count === 0)).toBe(true);
	});

	test("accepts Date instances as well as ISO strings", () => {
		const data = buildActivityData(
			[new Date("2026-06-24T10:00:00.000Z")],
			2,
			now,
		);
		const byDay = Object.fromEntries(data.map((d) => [d.date, d]));
		expect(byDay["2026-06-24"]?.count).toBe(1);
	});
});
