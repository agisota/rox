import { describe, expect, test } from "bun:test";
import { advanceAfterFire, computeNextFireAt } from "./reminders";

/**
 * Pure-helper unit tests for the C6 reminder fire math (db-free). Covers the
 * four shapes the scheduler relies on: one-off relative, recurring relative
 * across a DST boundary (the off-by-one-hour regression guard), absolute, and
 * an exhausted recurrence.
 */

describe("computeNextFireAt — relative one-off (rrule = null)", () => {
	test("fires offset minutes before the single occurrence start", () => {
		const dtstart = new Date("2026-06-20T09:00:00.000Z");
		const fire = computeNextFireAt({
			event: { dtstart, rrule: null, timezone: "UTC" },
			offsetMinutes: 10,
			absoluteFireAt: null,
			now: new Date("2026-06-19T00:00:00.000Z"),
		});
		expect(fire?.toISOString()).toBe("2026-06-20T08:50:00.000Z");
	});

	test("returns null when the only fire instant is already in the past", () => {
		const dtstart = new Date("2026-06-20T09:00:00.000Z");
		const fire = computeNextFireAt({
			event: { dtstart, rrule: null, timezone: "UTC" },
			offsetMinutes: 10,
			absoluteFireAt: null,
			// now is after dtstart - 10min, so the one-off fire already elapsed.
			now: new Date("2026-06-20T08:55:00.000Z"),
		});
		expect(fire).toBeNull();
	});
});

describe("computeNextFireAt — relative recurring across a DST boundary", () => {
	// FREQ=DAILY at 06:00 America/Los_Angeles. The engine keeps the wall-clock
	// time stable across the PST→PDT switch, so the real-UTC occurrence shifts
	// from 14:00Z (PST) to 13:00Z (PDT). A 30-min reminder must track that shift.
	const event = {
		dtstart: new Date("2026-03-06T20:00:00.000Z"),
		rrule: "FREQ=DAILY;BYHOUR=6;BYMINUTE=0",
		timezone: "America/Los_Angeles",
	};

	test("first fire = first future occurrence (PST) minus offset", () => {
		const fire = computeNextFireAt({
			event,
			offsetMinutes: 30,
			absoluteFireAt: null,
			now: new Date("2026-03-07T00:00:00.000Z"),
		});
		// occurrence 2026-03-07T14:00:00Z (PST) - 30min
		expect(fire?.toISOString()).toBe("2026-03-07T13:30:00.000Z");
	});

	test("next fire after the boundary uses the PDT occurrence (no off-by-one-hour)", () => {
		const fire = computeNextFireAt({
			event,
			offsetMinutes: 30,
			absoluteFireAt: null,
			// after the Mar 7 fire has elapsed → next occurrence is Mar 8 (PDT).
			now: new Date("2026-03-07T14:00:00.000Z"),
		});
		// occurrence 2026-03-08T13:00:00Z (PDT) - 30min
		expect(fire?.toISOString()).toBe("2026-03-08T12:30:00.000Z");
	});

	test("skips occurrences whose fire instant is already past", () => {
		const fire = computeNextFireAt({
			event,
			offsetMinutes: 30,
			absoluteFireAt: null,
			// now is exactly the Mar 7 fire instant → it must roll to Mar 8.
			now: new Date("2026-03-07T13:30:00.000Z"),
		});
		expect(fire?.toISOString()).toBe("2026-03-08T12:30:00.000Z");
	});
});

describe("computeNextFireAt — absolute", () => {
	test("returns the absolute instant when it is in the future", () => {
		const fire = computeNextFireAt({
			event: {
				dtstart: new Date("2026-06-20T09:00:00.000Z"),
				rrule: null,
				timezone: "UTC",
			},
			offsetMinutes: null,
			absoluteFireAt: new Date("2026-06-25T07:00:00.000Z"),
			now: new Date("2026-06-20T00:00:00.000Z"),
		});
		expect(fire?.toISOString()).toBe("2026-06-25T07:00:00.000Z");
	});

	test("returns null when the absolute instant is in the past", () => {
		const fire = computeNextFireAt({
			event: {
				dtstart: new Date("2026-06-20T09:00:00.000Z"),
				rrule: null,
				timezone: "UTC",
			},
			offsetMinutes: null,
			absoluteFireAt: new Date("2026-06-19T07:00:00.000Z"),
			now: new Date("2026-06-20T00:00:00.000Z"),
		});
		expect(fire).toBeNull();
	});
});

describe("computeNextFireAt — exhausted recurrence", () => {
	test("returns null once the bounded recurrence has no future occurrence", () => {
		const fire = computeNextFireAt({
			event: {
				dtstart: new Date("2026-06-01T09:00:00.000Z"),
				rrule: "FREQ=DAILY;COUNT=2;BYHOUR=9;BYMINUTE=0",
				timezone: "UTC",
			},
			offsetMinutes: 10,
			absoluteFireAt: null,
			// well after the 2nd (final) occurrence on 2026-06-02.
			now: new Date("2026-06-10T00:00:00.000Z"),
		});
		expect(fire).toBeNull();
	});
});

describe("advanceAfterFire", () => {
	test("returns the next occurrence's fire instant for a recurring relative reminder", () => {
		const next = advanceAfterFire({
			event: {
				dtstart: new Date("2026-06-01T09:00:00.000Z"),
				rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
				timezone: "UTC",
			},
			offsetMinutes: 15,
			firedFor: new Date("2026-06-01T08:45:00.000Z"),
			now: new Date("2026-06-01T08:45:00.000Z"),
		});
		// next occurrence 2026-06-02T09:00:00Z - 15min
		expect(next?.toISOString()).toBe("2026-06-02T08:45:00.000Z");
	});

	test("returns null for a one-off relative reminder (no further fires)", () => {
		const next = advanceAfterFire({
			event: {
				dtstart: new Date("2026-06-01T09:00:00.000Z"),
				rrule: null,
				timezone: "UTC",
			},
			offsetMinutes: 15,
			firedFor: new Date("2026-06-01T08:45:00.000Z"),
			now: new Date("2026-06-01T08:45:00.000Z"),
		});
		expect(next).toBeNull();
	});
});
