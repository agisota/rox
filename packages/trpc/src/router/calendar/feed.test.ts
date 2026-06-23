import { describe, expect, it } from "bun:test";
import type { SelectCalEvent } from "@rox/db/schema";
import { buildPublicCalendarFeed, mergeBusyIntervals } from "./feed";
import { exportFreeBusyIcs } from "./ics";

/**
 * Public calendar feed unit tests (DB-free). Covers the two serialization paths
 * — full detail (reuses {@link exportIcs}) and free-busy (busy intervals only) —
 * plus the {@link mergeBusyIntervals} union and recurrence expansion over the
 * bounded window. The free-busy path MUST NOT leak any real event detail
 * (title/description/location); the assertions assert their absence explicitly.
 */

/** Minimal `cal_events` row factory for the pure feed builder. */
function event(overrides: Partial<SelectCalEvent> = {}): SelectCalEvent {
	return {
		id: "11111111-1111-4111-8111-111111111111",
		organizationId: "org-1",
		calendarId: "cal-1",
		createdByUserId: "user-1",
		title: "Secret standup",
		description: "Hush hush agenda",
		location: "Room 42",
		dtstart: new Date("2026-06-20T09:00:00.000Z"),
		dtend: new Date("2026-06-20T10:00:00.000Z"),
		allDay: false,
		timezone: "UTC",
		rrule: null,
		exdates: [],
		status: "confirmed",
		metadata: {},
		createdAt: new Date("2026-06-01T00:00:00.000Z"),
		updatedAt: new Date("2026-06-01T00:00:00.000Z"),
		...overrides,
	} as SelectCalEvent;
}

describe("exportFreeBusyIcs", () => {
	it("emits a VCALENDAR with a Busy VEVENT and CRLF endings", () => {
		const ics = exportFreeBusyIcs(
			[
				{
					start: new Date("2026-06-20T09:00:00.000Z"),
					end: new Date("2026-06-20T10:00:00.000Z"),
				},
			],
			"Work",
		);
		expect(ics).toContain("BEGIN:VCALENDAR");
		expect(ics).toContain("END:VCALENDAR");
		expect(ics).toContain("BEGIN:VEVENT");
		expect(ics).toContain("END:VEVENT");
		expect(ics).toContain("\r\n");
		expect(ics).toContain("DTSTART:20260620T090000Z");
		expect(ics).toContain("DTEND:20260620T100000Z");
		expect(ics).toContain("SUMMARY:Busy");
		// Every VEVENT needs a stable, opaque UID.
		expect(ics).toContain("UID:");
	});

	it("never leaks event detail (no title/description/location keys beyond Busy)", () => {
		const ics = exportFreeBusyIcs([
			{
				start: new Date("2026-06-20T09:00:00.000Z"),
				end: new Date("2026-06-20T10:00:00.000Z"),
			},
		]);
		expect(ics).not.toContain("DESCRIPTION:");
		expect(ics).not.toContain("LOCATION:");
		expect(ics).not.toContain("RRULE:");
	});
});

describe("mergeBusyIntervals", () => {
	it("merges overlapping intervals into one", () => {
		const merged = mergeBusyIntervals([
			{
				start: new Date("2026-06-20T09:00:00.000Z"),
				end: new Date("2026-06-20T10:00:00.000Z"),
			},
			{
				start: new Date("2026-06-20T09:30:00.000Z"),
				end: new Date("2026-06-20T11:00:00.000Z"),
			},
		]);
		expect(merged).toHaveLength(1);
		expect(merged[0]?.start.toISOString()).toBe("2026-06-20T09:00:00.000Z");
		expect(merged[0]?.end.toISOString()).toBe("2026-06-20T11:00:00.000Z");
	});

	it("merges adjacent (touching) intervals", () => {
		const merged = mergeBusyIntervals([
			{
				start: new Date("2026-06-20T09:00:00.000Z"),
				end: new Date("2026-06-20T10:00:00.000Z"),
			},
			{
				start: new Date("2026-06-20T10:00:00.000Z"),
				end: new Date("2026-06-20T11:00:00.000Z"),
			},
		]);
		expect(merged).toHaveLength(1);
		expect(merged[0]?.end.toISOString()).toBe("2026-06-20T11:00:00.000Z");
	});

	it("keeps disjoint intervals separate and sorts unsorted input", () => {
		const merged = mergeBusyIntervals([
			{
				start: new Date("2026-06-20T14:00:00.000Z"),
				end: new Date("2026-06-20T15:00:00.000Z"),
			},
			{
				start: new Date("2026-06-20T09:00:00.000Z"),
				end: new Date("2026-06-20T10:00:00.000Z"),
			},
		]);
		expect(merged).toHaveLength(2);
		expect(merged[0]?.start.toISOString()).toBe("2026-06-20T09:00:00.000Z");
		expect(merged[1]?.start.toISOString()).toBe("2026-06-20T14:00:00.000Z");
	});

	it("returns [] for empty input", () => {
		expect(mergeBusyIntervals([])).toEqual([]);
	});
});

describe("buildPublicCalendarFeed — full mode", () => {
	it("contains the real event SUMMARY and detail", () => {
		const ics = buildPublicCalendarFeed({
			calendar: { name: "Work", timezone: "UTC" },
			events: [event()],
			busyOnly: false,
		});
		expect(ics).toContain("BEGIN:VCALENDAR");
		expect(ics).toContain("SUMMARY:Secret standup");
		expect(ics).toContain("DESCRIPTION:Hush hush agenda");
		expect(ics).toContain("LOCATION:Room 42");
		expect(ics).toContain("X-WR-CALNAME:Work");
	});

	it("excludes cancelled events", () => {
		const ics = buildPublicCalendarFeed({
			calendar: { name: "Work", timezone: "UTC" },
			events: [event({ status: "cancelled" })],
			busyOnly: false,
		});
		expect(ics).not.toContain("SUMMARY:Secret standup");
	});
});

describe("buildPublicCalendarFeed — busyOnly mode", () => {
	const window = {
		start: new Date("2026-06-01T00:00:00.000Z"),
		end: new Date("2026-07-01T00:00:00.000Z"),
	};

	it("omits every real event detail and emits Busy intervals", () => {
		const ics = buildPublicCalendarFeed({
			calendar: { name: "Work", timezone: "UTC" },
			events: [event()],
			busyOnly: true,
			window,
		});
		expect(ics).toContain("BEGIN:VCALENDAR");
		expect(ics).toContain("SUMMARY:Busy");
		expect(ics).toContain("DTSTART:20260620T090000Z");
		expect(ics).toContain("DTEND:20260620T100000Z");
		// No leak of the real event's text.
		expect(ics).not.toContain("Secret standup");
		expect(ics).not.toContain("Hush hush agenda");
		expect(ics).not.toContain("Room 42");
		expect(ics).not.toContain("DESCRIPTION:");
		expect(ics).not.toContain("LOCATION:");
	});

	it("expands a weekly recurring event into multiple busy intervals in the window", () => {
		const ics = buildPublicCalendarFeed({
			calendar: { name: "Work", timezone: "UTC" },
			events: [
				event({
					dtstart: new Date("2026-06-01T09:00:00.000Z"),
					dtend: new Date("2026-06-01T10:00:00.000Z"),
					rrule: "FREQ=WEEKLY;BYDAY=MO",
				}),
			],
			busyOnly: true,
			window,
		});
		// Mondays in June 2026: 1, 8, 15, 22, 29 → 5 busy VEVENTs.
		const matches = ics.match(/SUMMARY:Busy/g) ?? [];
		expect(matches.length).toBe(5);
		expect(ics).toContain("DTSTART:20260601T090000Z");
		expect(ics).toContain("DTSTART:20260629T090000Z");
	});

	it("merges back-to-back occurrences of different events into fewer intervals", () => {
		const ics = buildPublicCalendarFeed({
			calendar: { name: "Work", timezone: "UTC" },
			events: [
				event({
					id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
					dtstart: new Date("2026-06-20T09:00:00.000Z"),
					dtend: new Date("2026-06-20T10:00:00.000Z"),
				}),
				event({
					id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
					dtstart: new Date("2026-06-20T10:00:00.000Z"),
					dtend: new Date("2026-06-20T11:00:00.000Z"),
				}),
			],
			busyOnly: true,
			window,
		});
		const matches = ics.match(/SUMMARY:Busy/g) ?? [];
		expect(matches.length).toBe(1);
		expect(ics).toContain("DTSTART:20260620T090000Z");
		expect(ics).toContain("DTEND:20260620T110000Z");
	});

	it("spans an all-day event across its whole day", () => {
		const ics = buildPublicCalendarFeed({
			calendar: { name: "Work", timezone: "UTC" },
			events: [
				event({
					dtstart: new Date("2026-06-20T00:00:00.000Z"),
					dtend: new Date("2026-06-20T00:00:00.000Z"),
					allDay: true,
				}),
			],
			busyOnly: true,
			window,
		});
		expect(ics).toContain("DTSTART:20260620T000000Z");
		expect(ics).toContain("DTEND:20260621T000000Z");
	});
});
