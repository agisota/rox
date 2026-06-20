import { describe, expect, it } from "bun:test";
import { type ExpandableEvent, expandEvent, expandEvents } from "./occurrences";

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
