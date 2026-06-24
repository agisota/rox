import { describe, expect, it } from "bun:test";
import type { SelectCalEvent } from "@rox/db/schema";
import { buildPublicCalendarFeed, mergeBusyIntervals } from "./feed";
import { exportFreeBusyIcs } from "./ics";
import type { OccurrenceOverride } from "./occurrences";

/** Minimal per-occurrence override factory (RECURRENCE-ID), all-null by default. */
function override(
	originalStart: Date,
	patch: Partial<OccurrenceOverride> = {},
): OccurrenceOverride {
	return {
		originalStart,
		cancelled: false,
		dtstart: null,
		dtend: null,
		title: null,
		description: null,
		location: null,
		allDay: null,
		...patch,
	};
}

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

	it("omits a per-occurrence CANCELLED instance from the busy intervals", () => {
		const recurringId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
		const ics = buildPublicCalendarFeed({
			calendar: { name: "Work", timezone: "UTC" },
			events: [
				event({
					id: recurringId,
					dtstart: new Date("2026-06-01T09:00:00.000Z"),
					dtend: new Date("2026-06-01T10:00:00.000Z"),
					rrule: "FREQ=WEEKLY;BYDAY=MO",
				}),
			],
			busyOnly: true,
			window,
			overridesByEventId: new Map([
				[
					recurringId,
					// Cancel the 2026-06-15 instance only.
					[
						override(new Date("2026-06-15T09:00:00.000Z"), {
							cancelled: true,
						}),
					],
				],
			]),
		});
		// Mondays in June 2026: 1, 8, 15, 22, 29 → 5 normally; minus the cancelled
		// 15th → 4 busy VEVENTs, and the 15th's slot is absent.
		const matches = ics.match(/SUMMARY:Busy/g) ?? [];
		expect(matches.length).toBe(4);
		expect(ics).not.toContain("DTSTART:20260615T090000Z");
		expect(ics).toContain("DTSTART:20260608T090000Z");
		expect(ics).toContain("DTSTART:20260622T090000Z");
	});

	it("emits a per-occurrence RESCHEDULED instance at its NEW time only", () => {
		const recurringId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
		const ics = buildPublicCalendarFeed({
			calendar: { name: "Work", timezone: "UTC" },
			events: [
				event({
					id: recurringId,
					dtstart: new Date("2026-06-01T09:00:00.000Z"),
					dtend: new Date("2026-06-01T10:00:00.000Z"),
					rrule: "FREQ=WEEKLY;BYDAY=MO",
				}),
			],
			busyOnly: true,
			window,
			overridesByEventId: new Map([
				[
					recurringId,
					// Move the 2026-06-15 09:00 instance to 14:00 the same day.
					[
						override(new Date("2026-06-15T09:00:00.000Z"), {
							dtstart: new Date("2026-06-15T14:00:00.000Z"),
							dtend: new Date("2026-06-15T15:00:00.000Z"),
						}),
					],
				],
			]),
		});
		// New time present, old time gone; still 5 distinct busy intervals.
		expect(ics).toContain("DTSTART:20260615T140000Z");
		expect(ics).toContain("DTEND:20260615T150000Z");
		expect(ics).not.toContain("DTSTART:20260615T090000Z");
		const matches = ics.match(/SUMMARY:Busy/g) ?? [];
		expect(matches.length).toBe(5);
	});

	it("never leaks event detail even when overrides patch fields", () => {
		const recurringId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
		const ics = buildPublicCalendarFeed({
			calendar: { name: "Work", timezone: "UTC" },
			events: [
				event({
					id: recurringId,
					dtstart: new Date("2026-06-01T09:00:00.000Z"),
					dtend: new Date("2026-06-01T10:00:00.000Z"),
					rrule: "FREQ=WEEKLY;BYDAY=MO",
				}),
			],
			busyOnly: true,
			window,
			overridesByEventId: new Map([
				[
					recurringId,
					[
						override(new Date("2026-06-15T09:00:00.000Z"), {
							title: "Override secret",
							location: "Override room",
						}),
					],
				],
			]),
		});
		expect(ics).not.toContain("Override secret");
		expect(ics).not.toContain("Override room");
		expect(ics).not.toContain("DESCRIPTION:");
		expect(ics).not.toContain("LOCATION:");
	});
});

describe("buildPublicCalendarFeed — full mode per-occurrence overrides", () => {
	const recurringId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
	function recurring(): SelectCalEvent {
		return event({
			id: recurringId,
			title: "Weekly sync",
			description: null,
			location: null,
			dtstart: new Date("2026-06-01T09:00:00.000Z"),
			dtend: new Date("2026-06-01T10:00:00.000Z"),
			rrule: "FREQ=WEEKLY;BYDAY=MO",
		});
	}

	it("excludes a cancelled occurrence via EXDATE so a client drops that instance", () => {
		const ics = buildPublicCalendarFeed({
			calendar: { name: "Work", timezone: "UTC" },
			events: [recurring()],
			busyOnly: false,
			overridesByEventId: new Map([
				[
					recurringId,
					[
						override(new Date("2026-06-15T09:00:00.000Z"), {
							cancelled: true,
						}),
					],
				],
			]),
		});
		// The series VEVENT stays (RRULE), but the cancelled instant is in EXDATE.
		expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO");
		expect(ics).toContain("EXDATE:20260615T090000Z");
	});

	it("emits a RECURRENCE-ID override VEVENT at the new time for a rescheduled occurrence", () => {
		const ics = buildPublicCalendarFeed({
			calendar: { name: "Work", timezone: "UTC" },
			events: [recurring()],
			busyOnly: false,
			overridesByEventId: new Map([
				[
					recurringId,
					[
						override(new Date("2026-06-15T09:00:00.000Z"), {
							dtstart: new Date("2026-06-15T14:00:00.000Z"),
							dtend: new Date("2026-06-15T15:00:00.000Z"),
						}),
					],
				],
			]),
		});
		// A second VEVENT (same UID) carries the RECURRENCE-ID of the original
		// instant and the moved DTSTART/DTEND; the series RRULE VEVENT remains.
		expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO");
		expect(ics).toContain("RECURRENCE-ID:20260615T090000Z");
		expect(ics).toContain("DTSTART:20260615T140000Z");
		expect(ics).toContain("DTEND:20260615T150000Z");
		// The override VEVENT shares the series UID so clients replace the instance.
		const uidMatches = ics.match(new RegExp(`UID:${recurringId}@rox.one`, "g"));
		expect((uidMatches ?? []).length).toBe(2);
	});

	it("carries a 'this event only' field edit onto the override VEVENT", () => {
		const ics = buildPublicCalendarFeed({
			calendar: { name: "Work", timezone: "UTC" },
			events: [recurring()],
			busyOnly: false,
			overridesByEventId: new Map([
				[
					recurringId,
					[
						override(new Date("2026-06-15T09:00:00.000Z"), {
							title: "Special sync",
						}),
					],
				],
			]),
		});
		expect(ics).toContain("RECURRENCE-ID:20260615T090000Z");
		expect(ics).toContain("SUMMARY:Special sync");
		// The series occurrence keeps its own SUMMARY too.
		expect(ics).toContain("SUMMARY:Weekly sync");
	});
});
