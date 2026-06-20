import { describe, expect, test } from "bun:test";
import {
	combineDateTime,
	type EventFormValues,
	parseAttendeeEmails,
	toDateInput,
	toTimeInput,
	validateEventForm,
} from "./eventForm";

describe("toDateInput / toTimeInput", () => {
	test("formats local date and time with zero padding", () => {
		const date = new Date(2026, 5, 3, 9, 5);
		expect(toDateInput(date)).toBe("2026-06-03");
		expect(toTimeInput(date)).toBe("09:05");
	});

	test("round-trips through combineDateTime", () => {
		const date = new Date(2026, 11, 31, 23, 45);
		const combined = combineDateTime(
			toDateInput(date),
			toTimeInput(date),
			false,
		);
		expect(combined?.getTime()).toBe(date.getTime());
	});
});

describe("combineDateTime", () => {
	test("returns null for a malformed date", () => {
		expect(combineDateTime("2026/06/03", "09:00", false)).toBeNull();
		expect(combineDateTime("2026-13-01", "09:00", false)).toBeNull();
	});

	test("returns null for a malformed time when not all-day", () => {
		expect(combineDateTime("2026-06-03", "25:00", false)).toBeNull();
		expect(combineDateTime("2026-06-03", "abc", false)).toBeNull();
	});

	test("ignores the time when all-day and pins midnight", () => {
		const d = combineDateTime("2026-06-03", "nonsense", true);
		expect(d).not.toBeNull();
		expect(d?.getHours()).toBe(0);
		expect(d?.getMinutes()).toBe(0);
	});
});

describe("parseAttendeeEmails", () => {
	test("splits on commas, spaces, and semicolons", () => {
		expect(parseAttendeeEmails("a@x.com, b@y.com;c@z.com d@w.com")).toEqual([
			"a@x.com",
			"b@y.com",
			"c@z.com",
			"d@w.com",
		]);
	});

	test("dedupes and lowercases", () => {
		expect(parseAttendeeEmails("A@X.com a@x.com")).toEqual(["a@x.com"]);
	});

	test("drops non-emails and blanks", () => {
		expect(parseAttendeeEmails("not-an-email, , real@x.com")).toEqual([
			"real@x.com",
		]);
	});

	test("returns an empty array for empty input", () => {
		expect(parseAttendeeEmails("")).toEqual([]);
	});
});

function baseValues(overrides: Partial<EventFormValues> = {}): EventFormValues {
	return {
		title: "Standup",
		location: "Zoom",
		startDate: "2026-06-03",
		startTime: "09:00",
		endDate: "2026-06-03",
		endTime: "09:30",
		allDay: false,
		attendees: "a@x.com",
		...overrides,
	};
}

describe("validateEventForm", () => {
	test("accepts a valid timed event", () => {
		const result = validateEventForm(baseValues());
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.title).toBe("Standup");
			expect(result.value.location).toBe("Zoom");
			expect(result.value.attendeeEmails).toEqual(["a@x.com"]);
			expect(
				result.value.dtend.getTime() > result.value.dtstart.getTime(),
			).toBe(true);
		}
	});

	test("rejects an empty title", () => {
		const result = validateEventForm(baseValues({ title: "   " }));
		expect(result.ok).toBe(false);
	});

	test("rejects end before start", () => {
		const result = validateEventForm(
			baseValues({ startTime: "10:00", endTime: "09:00" }),
		);
		expect(result.ok).toBe(false);
	});

	test("nulls out blank location", () => {
		const result = validateEventForm(baseValues({ location: "  " }));
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.location).toBeNull();
	});

	test("allows all-day events ignoring time fields", () => {
		const result = validateEventForm(
			baseValues({ allDay: true, startTime: "", endTime: "" }),
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.allDay).toBe(true);
	});
});
