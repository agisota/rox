import { describe, expect, it } from "bun:test";
import {
	applyOverride,
	type EventOccurrence,
	type ExpandableEvent,
	expandEvent,
	expandEvents,
	type OccurrenceOverride,
} from "./occurrences";

function event(over: Partial<ExpandableEvent>): ExpandableEvent {
	return {
		id: "e1",
		dtstart: new Date("2026-06-01T09:00:00.000Z"),
		dtend: new Date("2026-06-01T10:00:00.000Z"),
		timezone: "UTC",
		rrule: null,
		exdates: [],
		...over,
	};
}

function override(over: Partial<OccurrenceOverride>): OccurrenceOverride {
	return {
		originalStart: new Date("2026-06-02T09:00:00.000Z"),
		cancelled: false,
		dtstart: null,
		dtend: null,
		title: null,
		description: null,
		location: null,
		allDay: null,
		...over,
	};
}

describe("expandEvent — one-off", () => {
	it("returns the single instance when it overlaps the window", () => {
		const out = expandEvent(
			event({}),
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-02T00:00:00.000Z"),
		);
		expect(out.occurrences).toHaveLength(1);
		expect(out.occurrences[0]?.start.toISOString()).toBe(
			"2026-06-01T09:00:00.000Z",
		);
		expect(out.occurrences[0]?.end.toISOString()).toBe(
			"2026-06-01T10:00:00.000Z",
		);
		expect(out.truncated).toBe(false);
	});

	it("excludes an event entirely outside the window", () => {
		const out = expandEvent(
			event({}),
			new Date("2026-07-01T00:00:00.000Z"),
			new Date("2026-07-02T00:00:00.000Z"),
		);
		expect(out.occurrences).toHaveLength(0);
	});

	it("includes a long event that started before the window but still runs in it", () => {
		const out = expandEvent(
			event({
				dtstart: new Date("2026-05-31T23:00:00.000Z"),
				dtend: new Date("2026-06-01T02:00:00.000Z"),
			}),
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-02T00:00:00.000Z"),
		);
		expect(out.occurrences).toHaveLength(1);
	});
});

describe("expandEvent — all-day (C2)", () => {
	it("renders a zero-duration all-day event across its whole day", () => {
		// dtend == dtstart (zero-length) but allDay: the event must still appear on
		// the day grid, spanning to end-of-day rather than collapsing to nothing.
		const out = expandEvent(
			event({
				allDay: true,
				dtstart: new Date("2026-06-01T00:00:00.000Z"),
				dtend: new Date("2026-06-01T00:00:00.000Z"),
				rrule: null,
			}),
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-02T00:00:00.000Z"),
		);
		expect(out.occurrences).toHaveLength(1);
		expect(out.occurrences[0]?.start.toISOString()).toBe(
			"2026-06-01T00:00:00.000Z",
		);
		// End spans to the next midnight (end-of-day) so the grid cell is covered.
		expect(out.occurrences[0]?.end.toISOString()).toBe(
			"2026-06-02T00:00:00.000Z",
		);
	});

	it("does not inflate a timed zero-duration event to a full day", () => {
		// A non-all-day zero-duration instant keeps the old half-open behaviour and
		// does NOT render at the very start of the window.
		const out = expandEvent(
			event({
				allDay: false,
				dtstart: new Date("2026-06-01T00:00:00.000Z"),
				dtend: new Date("2026-06-01T00:00:00.000Z"),
				rrule: null,
			}),
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-02T00:00:00.000Z"),
		);
		expect(out.occurrences).toHaveLength(0);
	});
});

describe("expandEvent — recurring", () => {
	it("expands a daily rule across a 3-day window", () => {
		const out = expandEvent(
			event({ rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0" }),
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-04T00:00:00.000Z"),
		);
		expect(out.occurrences.map((o) => o.start.toISOString())).toEqual([
			"2026-06-01T09:00:00.000Z",
			"2026-06-02T09:00:00.000Z",
			"2026-06-03T09:00:00.000Z",
		]);
	});

	it("honours COUNT (recurrence exhausted before window end)", () => {
		const out = expandEvent(
			event({ rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;COUNT=2" }),
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-10T00:00:00.000Z"),
		);
		expect(out.occurrences).toHaveLength(2);
	});

	it("skips EXDATE instances", () => {
		const out = expandEvent(
			event({
				rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
				exdates: ["2026-06-02T09:00:00.000Z"],
			}),
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-04T00:00:00.000Z"),
		);
		expect(out.occurrences.map((o) => o.start.toISOString())).toEqual([
			"2026-06-01T09:00:00.000Z",
			"2026-06-03T09:00:00.000Z",
		]);
	});

	it("cancels a timed instance from a DATE-only (midnight-UTC) EXDATE (C3)", () => {
		// An imported all-day EXDATE lands at midnight UTC and never millisecond-
		// matches the 09:00 instance; it must still cancel that calendar day.
		const out = expandEvent(
			event({
				rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
				exdates: ["2026-06-02T00:00:00.000Z"],
			}),
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-04T00:00:00.000Z"),
		);
		expect(out.occurrences.map((o) => o.start.toISOString())).toEqual([
			"2026-06-01T09:00:00.000Z",
			"2026-06-03T09:00:00.000Z",
		]);
	});

	it("a midnight EXDATE only cancels its own calendar day", () => {
		const out = expandEvent(
			event({
				rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
				exdates: ["2026-06-02T00:00:00.000Z"],
			}),
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-03T00:00:00.000Z"),
		);
		// Jun 1 survives; Jun 2 is cancelled.
		expect(out.occurrences.map((o) => o.start.toISOString())).toEqual([
			"2026-06-01T09:00:00.000Z",
		]);
	});
});

describe("expandEvent — DST correctness", () => {
	it("keeps a 09:00 wall-clock daily event at 09:00 local across a US spring-forward", () => {
		// US DST 2026 begins Sun Mar 8. A 9am America/New_York daily event must
		// stay 9am local — meaning the UTC instant shifts from 14:00Z to 13:00Z
		// once clocks spring forward, NOT drift by an hour.
		const out = expandEvent(
			event({
				dtstart: new Date("2026-03-06T14:00:00.000Z"), // Mar 6, 9am EST (UTC-5)
				dtend: new Date("2026-03-06T15:00:00.000Z"),
				timezone: "America/New_York",
				rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
			}),
			new Date("2026-03-06T00:00:00.000Z"),
			new Date("2026-03-11T00:00:00.000Z"),
		);
		const isos = out.occurrences.map((o) => o.start.toISOString());
		// Before DST (EST, UTC-5): 9am local = 14:00Z.
		expect(isos).toContain("2026-03-06T14:00:00.000Z");
		expect(isos).toContain("2026-03-07T14:00:00.000Z");
		// After DST (EDT, UTC-4): 9am local = 13:00Z.
		expect(isos).toContain("2026-03-09T13:00:00.000Z");
		expect(isos).toContain("2026-03-10T13:00:00.000Z");
	});
});

describe("expandEvent — robustness", () => {
	it("flags `truncated` when a sub-daily rule overruns the per-event cap", () => {
		// FREQ=MINUTELY over a 2-day window is 2880 instances, far past the
		// MAX_OCCURRENCES=1000 cap — expansion must stop and signal truncation
		// rather than silently dropping the tail.
		const out = expandEvent(
			event({ rrule: "FREQ=MINUTELY" }),
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-03T00:00:00.000Z"),
		);
		expect(out.truncated).toBe(true);
		expect(out.occurrences.length).toBeLessThanOrEqual(1000);
	});

	it("does not throw on a malformed RRULE row and still expands the rest", () => {
		const poisoned = event({ id: "bad", rrule: "FREQ=BOGUS;INTERVAL=nope" });
		const good = event({
			id: "good",
			dtstart: new Date("2026-06-01T11:00:00.000Z"),
			dtend: new Date("2026-06-01T12:00:00.000Z"),
		});
		let out: ReturnType<typeof expandEvents> | undefined;
		expect(() => {
			out = expandEvents(
				[poisoned, good],
				new Date("2026-06-01T00:00:00.000Z"),
				new Date("2026-06-02T00:00:00.000Z"),
			);
		}).not.toThrow();
		// The healthy event survives even though the poisoned row is skipped.
		expect(out?.occurrences.map((o) => o.eventId)).toContain("good");
	});
});

describe("expandEvents", () => {
	it("merges + sorts occurrences from multiple events chronologically", () => {
		const a = event({
			id: "a",
			dtstart: new Date("2026-06-01T15:00:00.000Z"),
			dtend: new Date("2026-06-01T16:00:00.000Z"),
		});
		const b = event({
			id: "b",
			dtstart: new Date("2026-06-01T09:00:00.000Z"),
			dtend: new Date("2026-06-01T10:00:00.000Z"),
		});
		const out = expandEvents(
			[a, b],
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-02T00:00:00.000Z"),
		);
		expect(out.occurrences.map((o) => o.eventId)).toEqual(["b", "a"]);
	});
});

// ---------------------------------------------------------------------------
// Per-occurrence overrides (RECURRENCE-ID) — TDD target for this feature.
// ---------------------------------------------------------------------------

describe("applyOverride (unit)", () => {
	const occ = (start: string, end: string): EventOccurrence => ({
		eventId: "e1",
		start: new Date(start),
		end: new Date(end),
	});

	it("returns the occurrence unchanged when no override matches", () => {
		const o = occ("2026-06-02T09:00:00.000Z", "2026-06-02T10:00:00.000Z");
		expect(applyOverride(o, undefined)).toBe(o);
	});

	it("drops (returns null) a cancelled override", () => {
		const o = occ("2026-06-02T09:00:00.000Z", "2026-06-02T10:00:00.000Z");
		expect(applyOverride(o, override({ cancelled: true }))).toBeNull();
	});

	it("moves both start and end when both are set, preserving originalStart", () => {
		const o = occ("2026-06-02T09:00:00.000Z", "2026-06-02T10:00:00.000Z");
		const patched = applyOverride(
			o,
			override({
				dtstart: new Date("2026-06-02T14:00:00.000Z"),
				dtend: new Date("2026-06-02T15:30:00.000Z"),
			}),
		);
		expect(patched?.start.toISOString()).toBe("2026-06-02T14:00:00.000Z");
		expect(patched?.end.toISOString()).toBe("2026-06-02T15:30:00.000Z");
		expect(patched?.originalStart?.toISOString()).toBe(
			"2026-06-02T09:00:00.000Z",
		);
		expect(patched?.overridden).toBe(true);
	});

	it("preserves the series duration when only the start moves", () => {
		const o = occ("2026-06-02T09:00:00.000Z", "2026-06-02T10:00:00.000Z");
		const patched = applyOverride(
			o,
			override({ dtstart: new Date("2026-06-02T14:00:00.000Z") }),
		);
		// 1h duration carried from the original occurrence.
		expect(patched?.start.toISOString()).toBe("2026-06-02T14:00:00.000Z");
		expect(patched?.end.toISOString()).toBe("2026-06-02T15:00:00.000Z");
	});

	it("preserves the series start when only the end moves", () => {
		const o = occ("2026-06-02T09:00:00.000Z", "2026-06-02T10:00:00.000Z");
		const patched = applyOverride(
			o,
			override({ dtend: new Date("2026-06-02T11:30:00.000Z") }),
		);
		expect(patched?.start.toISOString()).toBe("2026-06-02T09:00:00.000Z");
		expect(patched?.end.toISOString()).toBe("2026-06-02T11:30:00.000Z");
	});

	it("flags overridden + keeps the time for a field-only override", () => {
		const o = occ("2026-06-02T09:00:00.000Z", "2026-06-02T10:00:00.000Z");
		const patched = applyOverride(o, override({ title: "Moved sync" }));
		expect(patched?.start.toISOString()).toBe("2026-06-02T09:00:00.000Z");
		expect(patched?.end.toISOString()).toBe("2026-06-02T10:00:00.000Z");
		expect(patched?.overridden).toBe(true);
	});
});

describe("expandEvent — overrides", () => {
	const daily = () => event({ rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0" });
	const RANGE_START = new Date("2026-06-01T00:00:00.000Z");
	const RANGE_END = new Date("2026-06-04T00:00:00.000Z");

	it("a cancelled override hides exactly that instance", () => {
		const out = expandEvent(daily(), RANGE_START, RANGE_END, [
			override({
				originalStart: new Date("2026-06-02T09:00:00.000Z"),
				cancelled: true,
			}),
		]);
		expect(out.occurrences.map((o) => o.start.toISOString())).toEqual([
			"2026-06-01T09:00:00.000Z",
			"2026-06-03T09:00:00.000Z",
		]);
	});

	it("a moved-time override shifts start+end, preserves originalStart, sets overridden", () => {
		const out = expandEvent(daily(), RANGE_START, RANGE_END, [
			override({
				originalStart: new Date("2026-06-02T09:00:00.000Z"),
				dtstart: new Date("2026-06-02T14:00:00.000Z"),
				dtend: new Date("2026-06-02T15:00:00.000Z"),
			}),
		]);
		// Chronological order is preserved after the move (still within the day).
		const starts = out.occurrences.map((o) => o.start.toISOString());
		expect(starts).toEqual([
			"2026-06-01T09:00:00.000Z",
			"2026-06-02T14:00:00.000Z",
			"2026-06-03T09:00:00.000Z",
		]);
		const moved = out.occurrences.find(
			(o) => o.start.toISOString() === "2026-06-02T14:00:00.000Z",
		);
		expect(moved?.end.toISOString()).toBe("2026-06-02T15:00:00.000Z");
		expect(moved?.originalStart?.toISOString()).toBe(
			"2026-06-02T09:00:00.000Z",
		);
		expect(moved?.overridden).toBe(true);
	});

	it("a field-only override keeps the time and sets overridden", () => {
		const out = expandEvent(daily(), RANGE_START, RANGE_END, [
			override({
				originalStart: new Date("2026-06-02T09:00:00.000Z"),
				title: "Renamed",
				location: "Room 2",
			}),
		]);
		const target = out.occurrences.find(
			(o) => o.originalStart?.toISOString() === "2026-06-02T09:00:00.000Z",
		);
		expect(target?.start.toISOString()).toBe("2026-06-02T09:00:00.000Z");
		expect(target?.overridden).toBe(true);
	});

	it("ignores an off-by-one-millisecond override (exact-ms keying, not day)", () => {
		const out = expandEvent(daily(), RANGE_START, RANGE_END, [
			override({
				// 1ms after the real 09:00 instant — must NOT match.
				originalStart: new Date("2026-06-02T09:00:00.001Z"),
				cancelled: true,
			}),
		]);
		// All three instances survive: the override key never matched.
		expect(out.occurrences.map((o) => o.start.toISOString())).toEqual([
			"2026-06-01T09:00:00.000Z",
			"2026-06-02T09:00:00.000Z",
			"2026-06-03T09:00:00.000Z",
		]);
	});

	it("a one-off event (rrule null) ignores overrides", () => {
		const out = expandEvent(
			event({ rrule: null }),
			new Date("2026-06-01T00:00:00.000Z"),
			new Date("2026-06-02T00:00:00.000Z"),
			[
				override({
					originalStart: new Date("2026-06-01T09:00:00.000Z"),
					cancelled: true,
				}),
			],
		);
		// The single instance is still emitted despite the cancel override.
		expect(out.occurrences).toHaveLength(1);
		expect(out.occurrences[0]?.start.toISOString()).toBe(
			"2026-06-01T09:00:00.000Z",
		);
	});

	it("applies per-event overrides through expandEvents via overridesByEventId", () => {
		const a = event({ id: "a", rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0" });
		const b = event({
			id: "b",
			dtstart: new Date("2026-06-01T15:00:00.000Z"),
			dtend: new Date("2026-06-01T16:00:00.000Z"),
			rrule: "FREQ=DAILY;BYHOUR=15;BYMINUTE=0",
		});
		const out = expandEvents([a, b], RANGE_START, RANGE_END, {
			get: (id: string) =>
				id === "a"
					? [
							override({
								originalStart: new Date("2026-06-02T09:00:00.000Z"),
								cancelled: true,
							}),
						]
					: undefined,
			has: (id: string) => id === "a",
		} as unknown as Map<string, OccurrenceOverride[]>);
		// a's Jun 2 instance is cancelled; b is untouched.
		const aStarts = out.occurrences
			.filter((o) => o.eventId === "a")
			.map((o) => o.start.toISOString());
		expect(aStarts).toEqual([
			"2026-06-01T09:00:00.000Z",
			"2026-06-03T09:00:00.000Z",
		]);
		const bCount = out.occurrences.filter((o) => o.eventId === "b").length;
		expect(bCount).toBe(3);
	});

	it("a non-cancelled override on an EXDATE slot does not resurrect the instance", () => {
		// Jun 2 is EXDATE-skipped; an override row for that slot must stay hidden
		// (the slot left the generated set, so there is nothing to patch).
		const out = expandEvent(
			event({
				rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
				exdates: ["2026-06-02T09:00:00.000Z"],
			}),
			RANGE_START,
			RANGE_END,
			[
				override({
					originalStart: new Date("2026-06-02T09:00:00.000Z"),
					title: "Should not appear",
				}),
			],
		);
		expect(out.occurrences.map((o) => o.start.toISOString())).toEqual([
			"2026-06-01T09:00:00.000Z",
			"2026-06-03T09:00:00.000Z",
		]);
	});
});
