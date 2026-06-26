import { describe, expect, it } from "bun:test";
import {
	anchorToParam,
	calendarSearchSchema,
	DEFAULT_CALENDAR_VIEW,
	paramToAnchor,
	resolveCalendarSearch,
} from "./searchParams";

const todayParam = () => anchorToParam(new Date());

describe("anchorToParam / paramToAnchor (#538)", () => {
	it("serializes an instant to its UTC YYYY-MM-DD day", () => {
		expect(anchorToParam(new Date("2026-07-01T15:42:00.000Z"))).toBe(
			"2026-07-01",
		);
	});

	it("round-trips a YYYY-MM-DD day back to UTC midnight", () => {
		const anchor = paramToAnchor("2026-07-01");
		expect(anchor.toISOString()).toBe("2026-07-01T00:00:00.000Z");
		expect(anchorToParam(anchor)).toBe("2026-07-01");
	});

	it("normalizes a full-instant param down to its day", () => {
		// A param that still carries a time is floored to the UTC day.
		expect(anchorToParam(paramToAnchor("2026-07-01"))).toBe("2026-07-01");
	});

	it("falls back to today for a missing or malformed param", () => {
		expect(anchorToParam(paramToAnchor(undefined))).toBe(todayParam());
		expect(anchorToParam(paramToAnchor("not-a-date"))).toBe(todayParam());
		expect(anchorToParam(paramToAnchor("2026-7-1"))).toBe(todayParam());
	});

	it("rejects a rolled-over calendar date (2026-02-31 → today)", () => {
		expect(anchorToParam(paramToAnchor("2026-02-31"))).toBe(todayParam());
	});
});

describe("calendarSearchSchema (#538 validateSearch)", () => {
	it("leaves an empty search undefined (params stay optional for navigation)", () => {
		const out = calendarSearchSchema.parse({});
		expect(out.view).toBeUndefined();
		expect(out.anchor).toBeUndefined();
		expect(out.calendars).toBeUndefined();
	});

	it("preserves a fully-specified valid search (deep-link case)", () => {
		const out = calendarSearchSchema.parse({
			view: "day",
			anchor: "2026-07-01",
			calendars: ["cal-a", "cal-b"],
		});
		expect(out.view).toBe("day");
		expect(out.anchor).toBe("2026-07-01");
		expect(out.calendars).toEqual(["cal-a", "cal-b"]);
	});

	it("coerces a lone string `calendars` into a one-element array", () => {
		const out = calendarSearchSchema.parse({ calendars: "cal-a" });
		expect(out.calendars).toEqual(["cal-a"]);
	});

	it("drops non-string calendar entries", () => {
		const out = calendarSearchSchema.parse({
			calendars: ["cal-a", 5, null, "cal-b"],
		});
		expect(out.calendars).toEqual(["cal-a", "cal-b"]);
	});

	it("falls invalid `view` back to the default instead of throwing", () => {
		const out = calendarSearchSchema.parse({ view: "timeline" });
		expect(out.view).toBe("month");
	});

	it("falls invalid `anchor` back to today instead of throwing", () => {
		const out = calendarSearchSchema.parse({ view: "week", anchor: "🗓️" });
		expect(out.view).toBe("week");
		expect(out.anchor).toBe(todayParam());
	});

	it("never throws on hostile input", () => {
		expect(() =>
			calendarSearchSchema.parse({
				view: 42,
				anchor: { nope: true },
				calendars: "single",
			}),
		).not.toThrow();
	});
});

describe("resolveCalendarSearch (#538 read defaults)", () => {
	it("fills month / today / [] for an empty parsed search", () => {
		const resolved = resolveCalendarSearch(calendarSearchSchema.parse({}));
		expect(resolved.view).toBe(DEFAULT_CALENDAR_VIEW);
		expect(resolved.view).toBe("month");
		expect(resolved.anchor).toBe(todayParam());
		expect(resolved.calendars).toEqual([]);
	});

	it("passes through a concrete deep-linked search unchanged", () => {
		const resolved = resolveCalendarSearch(
			calendarSearchSchema.parse({
				view: "day",
				anchor: "2026-07-01",
				calendars: ["cal-a"],
			}),
		);
		expect(resolved).toEqual({
			view: "day",
			anchor: "2026-07-01",
			calendars: ["cal-a"],
		});
	});
});
