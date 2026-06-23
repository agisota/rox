import { describe, expect, test } from "bun:test";
import { formatChatDate } from "./formatChatDate";

const NOW = new Date("2026-06-23T15:00:00Z");

describe("formatChatDate", () => {
	test("returns null for missing input", () => {
		expect(formatChatDate(null, NOW)).toBeNull();
		expect(formatChatDate(undefined, NOW)).toBeNull();
		expect(formatChatDate("", NOW)).toBeNull();
	});

	test("returns null for an invalid date string", () => {
		expect(formatChatDate("not-a-date", NOW)).toBeNull();
	});

	test("same-day timestamp renders a time, not a date", () => {
		const out = formatChatDate(new Date("2026-06-23T09:30:00Z"), NOW);
		expect(out).not.toBeNull();
		// Time format contains a colon; short-date format would not.
		expect(out).toContain(":");
	});

	test("same-year earlier day renders a date without the year", () => {
		const out = formatChatDate(new Date("2026-01-05T09:30:00Z"), NOW);
		expect(out).not.toBeNull();
		expect(out).not.toContain("2026");
		expect(out).not.toContain(":");
	});

	test("prior-year timestamp includes the year", () => {
		const out = formatChatDate(new Date("2024-12-31T09:30:00Z"), NOW);
		expect(out).not.toBeNull();
		expect(out).toContain("2024");
	});

	test("accepts an ISO string the same way as a Date", () => {
		const a = formatChatDate("2026-06-23T09:30:00Z", NOW);
		const b = formatChatDate(new Date("2026-06-23T09:30:00Z"), NOW);
		expect(a).toBe(b);
	});
});
