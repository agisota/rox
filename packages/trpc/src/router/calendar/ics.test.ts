import { describe, expect, it } from "bun:test";
import { exportIcs, type IcsEvent, importIcs } from "./ics";

const baseEvent: IcsEvent = {
	uid: "evt-1@rox.one",
	title: "Standup; daily, with comma",
	description: "Line one\nLine two",
	location: "Room A",
	dtstart: new Date("2026-06-20T09:00:00.000Z"),
	dtend: new Date("2026-06-20T09:30:00.000Z"),
	allDay: false,
	rrule: "FREQ=WEEKLY;BYDAY=MO",
	exdates: ["2026-06-27T09:00:00.000Z"],
};

describe("exportIcs", () => {
	it("emits a VCALENDAR with a VEVENT and CRLF endings", () => {
		const ics = exportIcs([baseEvent], "Team");
		expect(ics).toContain("BEGIN:VCALENDAR");
		expect(ics).toContain("BEGIN:VEVENT");
		expect(ics).toContain("END:VEVENT");
		expect(ics).toContain("END:VCALENDAR");
		expect(ics).toContain("\r\n");
		expect(ics).toContain("UID:evt-1@rox.one");
		expect(ics).toContain("DTSTART:20260620T090000Z");
		expect(ics).toContain("DTEND:20260620T093000Z");
		expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO");
		expect(ics).toContain("EXDATE:20260627T090000Z");
		expect(ics).toContain("X-WR-CALNAME:Team");
	});

	it("escapes TEXT special characters (; , \\n)", () => {
		const ics = exportIcs([baseEvent]);
		expect(ics).toContain("SUMMARY:Standup\\; daily\\, with comma");
		expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
	});

	it("emits VALUE=DATE form for all-day events with an exclusive DTEND", () => {
		const ics = exportIcs([
			{ ...baseEvent, allDay: true, rrule: null, exdates: [] },
		]);
		expect(ics).toContain("DTSTART;VALUE=DATE:20260620");
		// RFC 5545: all-day DTEND is EXCLUSIVE (the day after the last day), so a
		// single-day all-day event spans 20260620 → 20260621, not a zero-length span.
		expect(ics).toContain("DTEND;VALUE=DATE:20260621");
	});
});

describe("importIcs", () => {
	it("parses a single VEVENT", () => {
		const ics = exportIcs([baseEvent]);
		const [parsed] = importIcs(ics);
		expect(parsed?.uid).toBe("evt-1@rox.one");
		expect(parsed?.title).toBe("Standup; daily, with comma");
		expect(parsed?.description).toBe("Line one\nLine two");
		expect(parsed?.location).toBe("Room A");
		expect(parsed?.dtstart.toISOString()).toBe("2026-06-20T09:00:00.000Z");
		expect(parsed?.dtend.toISOString()).toBe("2026-06-20T09:30:00.000Z");
		expect(parsed?.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
		expect(parsed?.exdates).toEqual(["2026-06-27T09:00:00.000Z"]);
	});

	it("round-trips export → import", () => {
		const ics = exportIcs([baseEvent]);
		const [parsed] = importIcs(ics);
		expect(parsed?.title).toBe(baseEvent.title);
		expect(parsed?.dtstart.getTime()).toBe(baseEvent.dtstart.getTime());
		expect(parsed?.rrule).toBe(baseEvent.rrule);
	});

	it("parses all-day VALUE=DATE events", () => {
		const ics = [
			"BEGIN:VCALENDAR",
			"BEGIN:VEVENT",
			"UID:d1",
			"SUMMARY:Holiday",
			"DTSTART;VALUE=DATE:20261225",
			"DTEND;VALUE=DATE:20261226",
			"END:VEVENT",
			"END:VCALENDAR",
		].join("\r\n");
		const [parsed] = importIcs(ics);
		expect(parsed?.allDay).toBe(true);
		expect(parsed?.dtstart.toISOString()).toBe("2026-12-25T00:00:00.000Z");
	});

	it("unfolds RFC 5545 line continuations", () => {
		const ics = [
			"BEGIN:VCALENDAR",
			"BEGIN:VEVENT",
			"UID:f1",
			"SUMMARY:A very long title that the",
			"  exporter folded onto two lines",
			"DTSTART:20260620T090000Z",
			"DTEND:20260620T093000Z",
			"END:VEVENT",
			"END:VCALENDAR",
		].join("\r\n");
		const [parsed] = importIcs(ics);
		expect(parsed?.title).toBe(
			"A very long title that the exporter folded onto two lines",
		);
	});

	it("ignores VEVENTs without a DTSTART", () => {
		const ics = [
			"BEGIN:VCALENDAR",
			"BEGIN:VEVENT",
			"UID:bad",
			"SUMMARY:No start",
			"END:VEVENT",
			"END:VCALENDAR",
		].join("\r\n");
		expect(importIcs(ics)).toHaveLength(0);
	});
});
