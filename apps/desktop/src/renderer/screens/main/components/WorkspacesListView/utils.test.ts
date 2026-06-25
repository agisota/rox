import { describe, expect, test } from "bun:test";
import { getRelativeTime } from "./utils";

const SECOND = 1000;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;

/** Builds a timestamp `ms` in the past relative to now. */
function ago(ms: number): number {
	return Date.now() - ms;
}

describe("getRelativeTime — RU default", () => {
	test("under a minute → только что", () => {
		expect(getRelativeTime(ago(10 * SECOND))).toBe("только что");
	});

	test("minutes pluralize correctly", () => {
		expect(getRelativeTime(ago(1 * MINUTE))).toBe("1 минуту назад");
		expect(getRelativeTime(ago(3 * MINUTE))).toBe("3 минуты назад");
		expect(getRelativeTime(ago(11 * MINUTE))).toBe("11 минут назад");
		expect(getRelativeTime(ago(21 * MINUTE))).toBe("21 минуту назад");
	});

	test("hours pluralize correctly", () => {
		expect(getRelativeTime(ago(1 * HOUR))).toBe("1 час назад");
		expect(getRelativeTime(ago(2 * HOUR))).toBe("2 часа назад");
		expect(getRelativeTime(ago(5 * HOUR))).toBe("5 часов назад");
	});

	test("one day → вчера", () => {
		expect(getRelativeTime(ago(1 * DAY))).toBe("вчера");
	});

	test("days pluralize correctly", () => {
		expect(getRelativeTime(ago(2 * DAY))).toBe("2 дня назад");
		expect(getRelativeTime(ago(5 * DAY))).toBe("5 дней назад");
	});

	test("weeks pluralize correctly", () => {
		expect(getRelativeTime(ago(7 * DAY))).toBe("1 неделю назад");
		expect(getRelativeTime(ago(14 * DAY))).toBe("2 недели назад");
		expect(getRelativeTime(ago(21 * DAY))).toBe("3 недели назад");
	});

	test("months pluralize correctly", () => {
		expect(getRelativeTime(ago(31 * DAY))).toBe("1 месяц назад");
		expect(getRelativeTime(ago(70 * DAY))).toBe("2 месяца назад");
		expect(getRelativeTime(ago(160 * DAY))).toBe("5 месяцев назад");
	});

	test("over a year → больше года назад", () => {
		expect(getRelativeTime(ago(400 * DAY))).toBe("больше года назад");
	});

	test("never emits an english unit", () => {
		const samples = [
			10 * SECOND,
			5 * MINUTE,
			3 * HOUR,
			2 * DAY,
			10 * DAY,
			60 * DAY,
			400 * DAY,
		];
		for (const ms of samples) {
			const text = getRelativeTime(ago(ms));
			expect(text).not.toMatch(
				/ago|yesterday|now|week|day|month|year|hour|minute/i,
			);
		}
	});
});

describe("getRelativeTime — RU compact", () => {
	test("compact uses terse RU latin-free units", () => {
		expect(getRelativeTime(ago(10 * SECOND), { format: "compact" })).toBe(
			"сейчас",
		);
		expect(getRelativeTime(ago(5 * MINUTE), { format: "compact" })).toBe("5м");
		expect(getRelativeTime(ago(3 * HOUR), { format: "compact" })).toBe("3ч");
		expect(getRelativeTime(ago(2 * DAY), { format: "compact" })).toBe("2д");
		expect(getRelativeTime(ago(14 * DAY), { format: "compact" })).toBe("2нед");
		expect(getRelativeTime(ago(60 * DAY), { format: "compact" })).toBe("2мес");
		expect(getRelativeTime(ago(400 * DAY), { format: "compact" })).toBe("1г");
	});
});
