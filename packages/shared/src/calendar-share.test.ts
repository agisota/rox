import { describe, expect, it } from "bun:test";
import {
	buildCalendarUpdateInput,
	CALENDAR_SHARE_ROLE_OPTIONS,
	CALENDAR_SHARE_ROLES,
	isCalendarShareRole,
} from "./calendar-share";

describe("calendar-share", () => {
	it("exposes the three ACL roles in privilege order", () => {
		expect(CALENDAR_SHARE_ROLES).toEqual(["reader", "writer", "owner"]);
	});

	it("builds labelled options for each role", () => {
		expect(CALENDAR_SHARE_ROLE_OPTIONS).toHaveLength(3);
		for (const opt of CALENDAR_SHARE_ROLE_OPTIONS) {
			expect(opt.label.length).toBeGreaterThan(0);
			expect(isCalendarShareRole(opt.value)).toBe(true);
		}
	});

	it("guards unknown roles", () => {
		expect(isCalendarShareRole("reader")).toBe(true);
		expect(isCalendarShareRole("admin")).toBe(false);
	});

	const current = { name: "Work", color: "#fff", timezone: "UTC" };

	it("returns null when nothing changed", () => {
		expect(
			buildCalendarUpdateInput(
				"c1",
				{ name: "Work", color: "#fff", timezone: "UTC" },
				current,
			),
		).toBeNull();
	});

	it("trims and includes only changed fields", () => {
		expect(
			buildCalendarUpdateInput(
				"c1",
				{ name: "  Personal  ", color: "#fff", timezone: "UTC" },
				current,
			),
		).toEqual({ calendarId: "c1", name: "Personal" });
	});

	it("sends color as null when cleared", () => {
		expect(
			buildCalendarUpdateInput(
				"c1",
				{ name: "Work", color: "  ", timezone: "UTC" },
				current,
			),
		).toEqual({ calendarId: "c1", color: null });
	});

	it("ignores an empty name (cannot clear the required name)", () => {
		expect(
			buildCalendarUpdateInput(
				"c1",
				{ name: "   ", color: "#fff", timezone: "UTC" },
				current,
			),
		).toBeNull();
	});

	it("updates the timezone", () => {
		expect(
			buildCalendarUpdateInput(
				"c1",
				{ name: "Work", color: "#fff", timezone: "Europe/Moscow" },
				current,
			),
		).toEqual({ calendarId: "c1", timezone: "Europe/Moscow" });
	});
});
