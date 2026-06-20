import { describe, expect, test } from "bun:test";

import { buildRevenueTrend, type ConfirmedTopup } from "./revenue";

const NOW = new Date("2026-06-10T12:00:00.000Z");

describe("buildRevenueTrend (T9)", () => {
	test("fills a contiguous date range, oldest first, with mrr null", () => {
		const trend = buildRevenueTrend([], 7, NOW);
		expect(trend).toHaveLength(7);
		expect(trend[0]?.date).toBe("2026-06-04");
		expect(trend[6]?.date).toBe("2026-06-10");
		expect(trend.every((p) => p.revenue === 0)).toBe(true);
		expect(trend.every((p) => p.mrr === null)).toBe(true);
	});

	test("sums confirmed topups into their UTC confirmation day", () => {
		const topups: ConfirmedTopup[] = [
			{ usdtAmount: "10", confirmedAt: new Date("2026-06-09T08:00:00.000Z") },
			{ usdtAmount: "5.5", confirmedAt: new Date("2026-06-09T20:00:00.000Z") },
			{ usdtAmount: "30", confirmedAt: new Date("2026-06-10T01:00:00.000Z") },
		];
		const trend = buildRevenueTrend(topups, 7, NOW);
		const day9 = trend.find((p) => p.date === "2026-06-09");
		const day10 = trend.find((p) => p.date === "2026-06-10");
		expect(day9?.revenue).toBe(15.5);
		expect(day10?.revenue).toBe(30);
	});

	test("ignores topups with a null confirmedAt", () => {
		const topups: ConfirmedTopup[] = [
			{ usdtAmount: "99", confirmedAt: null },
			{ usdtAmount: "1", confirmedAt: new Date("2026-06-10T00:00:00.000Z") },
		];
		const trend = buildRevenueTrend(topups, 7, NOW);
		const total = trend.reduce((sum, p) => sum + p.revenue, 0);
		expect(total).toBe(1);
	});

	test("drops revenue outside the window (no negative-index buckets)", () => {
		const topups: ConfirmedTopup[] = [
			{ usdtAmount: "1000", confirmedAt: new Date("2026-05-01T00:00:00.000Z") },
		];
		const trend = buildRevenueTrend(topups, 7, NOW);
		expect(trend.reduce((s, p) => s + p.revenue, 0)).toBe(0);
	});

	test("coerces string usdt amounts and tolerates NaN", () => {
		const topups: ConfirmedTopup[] = [
			{ usdtAmount: "12.34", confirmedAt: NOW },
			{ usdtAmount: "not-a-number", confirmedAt: NOW },
		];
		const trend = buildRevenueTrend(topups, 1, NOW);
		expect(trend[0]?.revenue).toBeCloseTo(12.34, 5);
	});
});
