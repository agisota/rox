import { describe, expect, test } from "bun:test";
import {
	type AgendaEvent,
	type AgendaOccurrence,
	buildAgenda,
	dayKey,
} from "./buildAgenda";

const events: AgendaEvent[] = [
	{ id: "e1", title: "Standup", location: "Zoom", allDay: false },
	{ id: "e2", title: "Lunch", location: null, allDay: false },
];

describe("dayKey", () => {
	test("formats a local YYYY-MM-DD key", () => {
		expect(dayKey(new Date(2026, 5, 21, 9, 30))).toBe("2026-06-21");
		expect(dayKey(new Date(2026, 0, 3, 0, 0))).toBe("2026-01-03");
	});
});

describe("buildAgenda", () => {
	test("joins occurrences to events, sorts, and groups by day", () => {
		const occurrences: AgendaOccurrence[] = [
			{
				eventId: "e2",
				start: new Date(2026, 5, 21, 12, 0).toISOString(),
				end: new Date(2026, 5, 21, 13, 0).toISOString(),
			},
			{
				eventId: "e1",
				start: new Date(2026, 5, 21, 9, 0).toISOString(),
				end: new Date(2026, 5, 21, 9, 15).toISOString(),
			},
			{
				eventId: "e1",
				start: new Date(2026, 5, 22, 9, 0).toISOString(),
				end: new Date(2026, 5, 22, 9, 15).toISOString(),
			},
		];

		const sections = buildAgenda(occurrences, events);
		expect(sections).toHaveLength(2);
		expect(sections[0]?.dayKey).toBe("2026-06-21");
		// Sorted within day: 9:00 standup before 12:00 lunch.
		expect(sections[0]?.data.map((i) => i.title)).toEqual(["Standup", "Lunch"]);
		expect(sections[1]?.dayKey).toBe("2026-06-22");
		expect(sections[1]?.data).toHaveLength(1);
	});

	test("drops occurrences with no matching event or invalid date", () => {
		const occurrences: AgendaOccurrence[] = [
			{ eventId: "missing", start: new Date().toISOString(), end: "" },
			{ eventId: "e1", start: "not-a-date", end: "" },
		];
		expect(buildAgenda(occurrences, events)).toHaveLength(0);
	});
});
