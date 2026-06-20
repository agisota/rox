import { describe, expect, it } from "bun:test";
import { fromDatetimeLocal, toDatetimeLocal } from "./datetimeLocal";

describe("datetimeLocal", () => {
	it("formats a UTC instant to a datetime-local string", () => {
		expect(toDatetimeLocal(new Date("2026-06-20T09:30:00.000Z"))).toBe(
			"2026-06-20T09:30",
		);
	});

	it("parses a datetime-local string as UTC", () => {
		expect(fromDatetimeLocal("2026-06-20T09:30")?.toISOString()).toBe(
			"2026-06-20T09:30:00.000Z",
		);
	});

	it("round-trips", () => {
		const d = new Date("2026-12-31T23:59:00.000Z");
		expect(fromDatetimeLocal(toDatetimeLocal(d))?.getTime()).toBe(d.getTime());
	});

	it("returns null for an empty or invalid value", () => {
		expect(fromDatetimeLocal("")).toBeNull();
		expect(fromDatetimeLocal("not-a-date")).toBeNull();
	});
});
