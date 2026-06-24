import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Dispatch tests for the C6 reminder due-scan. Drives the REAL
 * {@link runDueReminders} (and the REAL pure `advanceAfterFire`) through a DB
 * stub — only `@rox/db/client` and the logger are mocked, never the shared
 * `@rox/trpc/*` barrels. The email channel is naturally inert here because the
 * real `getMailSendFn` seam returns `null` without MAIL_OUTBOUND_ENABLED.
 */

type AnyRow = Record<string, unknown>;

const state: {
	dueRows: AnyRow[];
	/**
	 * Per-occurrence override rows the `cal_event_occurrences` lookup resolves to.
	 * The dispatch selects at most one by (eventId, originalStart); the stub
	 * returns the first row whose `eventId` matches the query (sufficient for the
	 * single-reminder cases here). Empty ⇒ no override (the normal-fire path).
	 */
	occurrenceRows: AnyRow[];
	inserted: { table: string; values: AnyRow[] }[];
	updated: { id: string; set: AnyRow }[];
	/**
	 * Row counts the next claim `UPDATE ... RETURNING` calls resolve to, consumed
	 * FIFO. Models the single-claimer race: the first tick over a due row wins
	 * (1 row) and a later overlapping tick loses (0 rows). Empty ⇒ default 1 (the
	 * uncontended single-tick case the existing dispatch tests exercise).
	 */
	claimReturns: number[];
} = {
	dueRows: [],
	occurrenceRows: [],
	inserted: [],
	updated: [],
	claimReturns: [],
};

function tableName(table: unknown): string {
	if (!table || typeof table !== "object") return "";
	const sym = Object.getOwnPropertySymbols(table).find(
		(s) => s.description === "drizzle:Name",
	);
	return sym ? String((table as Record<symbol, unknown>)[sym]) : "";
}

// `id` extracted from a drizzle eq(...) where-clause so update/where can record
// which reminder row it targeted.
function firstParamValue(clause: unknown): string | undefined {
	let found: string | undefined;
	const seen = new Set<unknown>();
	const walk = (o: unknown, depth = 0): void => {
		if (found || depth > 8 || !o || typeof o !== "object" || seen.has(o))
			return;
		seen.add(o);
		const rec = o as Record<string, unknown>;
		if ("value" in rec && typeof rec.value === "string") {
			found = rec.value;
			return;
		}
		for (const v of Object.values(rec)) {
			if (Array.isArray(v)) for (const it of v) walk(it, depth + 1);
			else if (v && typeof v === "object") walk(v, depth + 1);
		}
	};
	walk(clause);
	return found;
}

type ThenableChain = Promise<AnyRow[]> &
	Record<string, (...a: unknown[]) => unknown>;

/**
 * The post-`.from()` chain: a real Promise (so `await` resolves it without a
 * hand-rolled `then`) carrying the no-op builder methods the dispatch calls
 * (`.where`, `.limit`, `.innerJoin`, `.orderBy`). Resolves to the rows the
 * selected table supplies.
 */
function thenableChain(rows: AnyRow[]): ThenableChain {
	const p = Promise.resolve(rows) as ThenableChain;
	p.innerJoin = () => p;
	p.where = () => p;
	p.orderBy = () => p;
	p.limit = () => p;
	return p;
}

/**
 * A select stub that resolves rows by the table passed to `.from()` — supporting
 * both the due-scan (`select().from(calReminders).innerJoin(...)`) and the
 * per-occurrence override lookup
 * (`select().from(calEventOccurrences).where(...).limit(1)`) off one stub. The
 * `users` table (email path) resolves to `[]` — the email tests use the inert
 * seam and never reach it.
 */
const fakeDb = {
	select() {
		return {
			from(table: unknown) {
				const name = tableName(table);
				if (name === "cal_reminders") return thenableChain(state.dueRows);
				if (name === "cal_event_occurrences") {
					return thenableChain(state.occurrenceRows);
				}
				return thenableChain([]);
			},
		};
	},
	insert(table: unknown) {
		const name = tableName(table);
		return {
			values(vals: AnyRow | AnyRow[]) {
				const arr = Array.isArray(vals) ? vals : [vals];
				state.inserted.push({ table: name, values: arr });
				return Promise.resolve();
			},
		};
	},
	update() {
		return {
			set(set: AnyRow) {
				return {
					where(clause: unknown) {
						state.updated.push({ id: firstParamValue(clause) ?? "?", set });
						// The claim path awaits `.returning()`; the cancel / failed
						// flips await `.where()` directly. Support both: a thenable
						// (resolves void) that also carries `.returning()`.
						const rows = () => {
							const n = state.claimReturns.length
								? (state.claimReturns.shift() as number)
								: 1; // uncontended default: the claim wins.
							return Array.from({ length: n }, () => ({ id: "claimed" }));
						};
						const result = Promise.resolve() as Promise<void> & {
							returning: () => Promise<AnyRow[]>;
						};
						result.returning = () => Promise.resolve(rows());
						return result;
					},
				};
			},
		};
	},
};

mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
mock.module("@/lib/logger", () => ({
	logger: { error: () => {}, warn: () => {}, info: () => {} },
}));

const { runDueReminders, CALENDAR_REMINDER_KIND } = await import(
	"./reminder-dispatch"
);

const ORG = "org-1";
const OWNER = "user-1";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";

function oneOffReminder(overrides: AnyRow = {}): AnyRow {
	return {
		reminder: {
			id: "reminder-1",
			organizationId: ORG,
			eventId: EVENT_ID,
			ownerUserId: OWNER,
			channel: "in_app",
			triggerKind: "relative",
			offsetMinutes: 10,
			absoluteFireAt: null,
			nextFireAt: new Date("2026-06-20T08:50:00.000Z"),
			lastFiredAt: null,
			status: "scheduled",
			...(overrides.reminder as AnyRow),
		},
		event: {
			id: EVENT_ID,
			calendarId: "cal-1",
			organizationId: ORG,
			title: "Standup",
			location: null,
			dtstart: new Date("2026-06-20T09:00:00.000Z"),
			dtend: new Date("2026-06-20T10:00:00.000Z"),
			timezone: "UTC",
			rrule: null,
			exdates: [],
			status: "confirmed",
			...(overrides.event as AnyRow),
		},
	};
}

beforeEach(() => {
	state.dueRows = [];
	state.occurrenceRows = [];
	state.inserted = [];
	state.updated = [];
	state.claimReturns = [];
});

describe("runDueReminders — in_app delivery", () => {
	test("writes a journal_events row with kind='calendar_reminder' for the owner", async () => {
		state.dueRows = [oneOffReminder()];
		const res = await runDueReminders(new Date("2026-06-20T08:55:00.000Z"));

		expect(res.considered).toBe(1);
		expect(res.fired).toBe(1);
		expect(res.advanced).toBe(0);
		expect(res.skipped).toBe(0);
		expect(res.failed).toBe(0);

		const journalInsert = state.inserted.find(
			(i) => i.table === "journal_events",
		);
		expect(journalInsert).toBeDefined();
		const row = journalInsert?.values[0];
		expect(row?.kind).toBe(CALENDAR_REMINDER_KIND);
		expect(row?.createdBy).toBe(OWNER);
		expect(row?.organizationId).toBe(ORG);
		expect(row?.title).toBe("Standup");
		expect((row?.payload as AnyRow)?.eventId).toBe(EVENT_ID);
	});

	test("a one-off reminder flips to status='fired' with last_fired_at", async () => {
		state.dueRows = [oneOffReminder()];
		const now = new Date("2026-06-20T08:55:00.000Z");
		await runDueReminders(now);

		const update = state.updated.find((u) => u.id === "reminder-1");
		expect(update?.set.status).toBe("fired");
		expect(update?.set.lastFiredAt).toEqual(now);
		expect(update?.set.nextFireAt).toBeUndefined();
	});
});

describe("runDueReminders — recurring relative advance", () => {
	test("a recurring reminder advances next_fire_at and stays scheduled", async () => {
		state.dueRows = [
			oneOffReminder({
				reminder: {
					id: "reminder-rec",
					organizationId: ORG,
					eventId: EVENT_ID,
					ownerUserId: OWNER,
					channel: "in_app",
					triggerKind: "relative",
					offsetMinutes: 15,
					absoluteFireAt: null,
					nextFireAt: new Date("2026-06-01T08:45:00.000Z"),
					lastFiredAt: null,
					status: "scheduled",
				},
				event: {
					id: EVENT_ID,
					calendarId: "cal-1",
					organizationId: ORG,
					title: "Daily sync",
					location: null,
					dtstart: new Date("2026-06-01T09:00:00.000Z"),
					dtend: new Date("2026-06-01T09:30:00.000Z"),
					timezone: "UTC",
					rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
					exdates: [],
					status: "confirmed",
				},
			}),
		];
		const now = new Date("2026-06-01T08:46:00.000Z");
		const res = await runDueReminders(now);

		expect(res.advanced).toBe(1);
		expect(res.fired).toBe(0);
		const update = state.updated.find((u) => u.id === "reminder-rec");
		expect(update?.set.status).toBe("scheduled");
		// next occurrence 2026-06-02T09:00Z - 15min.
		expect((update?.set.nextFireAt as Date).toISOString()).toBe(
			"2026-06-02T08:45:00.000Z",
		);
		expect(update?.set.lastFiredAt).toEqual(now);
	});
});

describe("runDueReminders — email channel inert seam", () => {
	test("email reminder is a clean skip (counted skipped, no journal row) without outbound config", async () => {
		state.dueRows = [
			oneOffReminder({ reminder: { id: "reminder-mail", channel: "email" } }),
		];
		const res = await runDueReminders(new Date("2026-06-20T08:55:00.000Z"));

		expect(res.skipped).toBe(1);
		expect(res.fired).toBe(0);
		expect(res.advanced).toBe(0);
		// inert email path writes nothing and does not settle the row.
		expect(state.inserted).toHaveLength(0);
		expect(state.updated).toHaveLength(0);
	});
});

describe("runDueReminders — cancelled events", () => {
	test("a reminder on a cancelled event is skipped and flipped to cancelled", async () => {
		state.dueRows = [
			oneOffReminder({
				reminder: { id: "reminder-cancel" },
				event: {
					id: EVENT_ID,
					calendarId: "cal-1",
					organizationId: ORG,
					title: "Cancelled",
					location: null,
					dtstart: new Date("2026-06-20T09:00:00.000Z"),
					dtend: new Date("2026-06-20T10:00:00.000Z"),
					timezone: "UTC",
					rrule: null,
					exdates: [],
					status: "cancelled",
				},
			}),
		];
		const res = await runDueReminders(new Date("2026-06-20T08:55:00.000Z"));

		expect(res.skipped).toBe(1);
		expect(res.fired).toBe(0);
		// no journal row for a cancelled event.
		expect(state.inserted).toHaveLength(0);
		const update = state.updated.find((u) => u.id === "reminder-cancel");
		expect(update?.set.status).toBe("cancelled");
	});
});

// A recurring relative reminder whose `next_fire_at` targets a specific instance
// of the series. dtstart 2026-06-01T09:00Z + daily rule, 15-min offset ⇒
// next_fire_at 2026-06-02T08:45Z targets the 2026-06-02T09:00Z occurrence.
function recurringReminderForJun2(): AnyRow {
	return oneOffReminder({
		reminder: {
			id: "reminder-rec-occ",
			organizationId: ORG,
			eventId: EVENT_ID,
			ownerUserId: OWNER,
			channel: "in_app",
			triggerKind: "relative",
			offsetMinutes: 15,
			absoluteFireAt: null,
			nextFireAt: new Date("2026-06-02T08:45:00.000Z"),
			lastFiredAt: null,
			status: "scheduled",
		},
		event: {
			id: EVENT_ID,
			calendarId: "cal-1",
			organizationId: ORG,
			title: "Daily sync",
			location: null,
			dtstart: new Date("2026-06-01T09:00:00.000Z"),
			dtend: new Date("2026-06-01T09:30:00.000Z"),
			timezone: "UTC",
			rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
			exdates: [],
			status: "confirmed",
		},
	});
}

/** A `cal_event_occurrences` override row keyed by its RECURRENCE-ID instant. */
function occurrenceOverride(overrides: AnyRow = {}): AnyRow {
	return {
		id: "occ-1",
		organizationId: ORG,
		eventId: EVENT_ID,
		ownerUserId: OWNER,
		originalStart: new Date("2026-06-02T09:00:00.000Z"),
		cancelled: false,
		overrideTitle: null,
		overrideDescription: null,
		overrideLocation: null,
		overrideDtstart: null,
		overrideDtend: null,
		overrideAllDay: null,
		...overrides,
	};
}

describe("runDueReminders — per-occurrence cancelled/moved instance", () => {
	test("a reminder pointing at a CANCELLED occurrence does NOT deliver and advances", async () => {
		state.dueRows = [recurringReminderForJun2()];
		// The exact instance this fire targets is cancelled via an override row.
		state.occurrenceRows = [occurrenceOverride({ cancelled: true })];
		const now = new Date("2026-06-02T08:46:00.000Z");

		const res = await runDueReminders(now);

		// Skipped, not fired: no journal row written for the cancelled instance.
		expect(res.skipped).toBe(1);
		expect(res.fired).toBe(0);
		expect(res.advanced).toBe(0);
		expect(
			state.inserted.filter((i) => i.table === "journal_events"),
		).toHaveLength(0);

		// But the reminder still ADVANCES (claim path) to the next occurrence's fire
		// (2026-06-03T09:00Z - 15min), staying scheduled — it keeps moving forward.
		const update = state.updated.find((u) => u.id === "reminder-rec-occ");
		expect(update?.set.status).toBe("scheduled");
		expect((update?.set.nextFireAt as Date).toISOString()).toBe(
			"2026-06-03T08:45:00.000Z",
		);
		expect(update?.set.lastFiredAt).toEqual(now);
	});

	test("a reminder pointing at a MOVED occurrence does NOT deliver at the stale time and advances", async () => {
		state.dueRows = [recurringReminderForJun2()];
		// The instance was rescheduled (override_dtstart set) — the reminder must not
		// fire at its now-stale slot.
		state.occurrenceRows = [
			occurrenceOverride({
				cancelled: false,
				overrideDtstart: new Date("2026-06-02T14:00:00.000Z"),
			}),
		];
		const now = new Date("2026-06-02T08:46:00.000Z");

		const res = await runDueReminders(now);

		expect(res.skipped).toBe(1);
		expect(res.fired).toBe(0);
		expect(res.advanced).toBe(0);
		expect(
			state.inserted.filter((i) => i.table === "journal_events"),
		).toHaveLength(0);
		// Advanced past the stale slot to the next occurrence's fire.
		const update = state.updated.find((u) => u.id === "reminder-rec-occ");
		expect(update?.set.status).toBe("scheduled");
		expect((update?.set.nextFireAt as Date).toISOString()).toBe(
			"2026-06-03T08:45:00.000Z",
		);
	});

	test("a normal (non-cancelled, non-moved) occurrence still fires", async () => {
		state.dueRows = [recurringReminderForJun2()];
		// An override row that only patches the title leaves the time intact ⇒ fire.
		state.occurrenceRows = [
			occurrenceOverride({ cancelled: false, overrideTitle: "Patched title" }),
		];
		const now = new Date("2026-06-02T08:46:00.000Z");

		const res = await runDueReminders(now);

		expect(res.advanced).toBe(1);
		expect(res.skipped).toBe(0);
		expect(res.fired).toBe(0);
		// The in-app delivery happened: a journal_events row was written.
		expect(
			state.inserted.filter((i) => i.table === "journal_events"),
		).toHaveLength(1);
		const update = state.updated.find((u) => u.id === "reminder-rec-occ");
		expect(update?.set.status).toBe("scheduled");
	});

	test("a recurring reminder with NO override row for the instance fires normally", async () => {
		state.dueRows = [recurringReminderForJun2()];
		state.occurrenceRows = []; // no per-occurrence override at all.
		const now = new Date("2026-06-02T08:46:00.000Z");

		const res = await runDueReminders(now);

		expect(res.advanced).toBe(1);
		expect(res.skipped).toBe(0);
		expect(
			state.inserted.filter((i) => i.table === "journal_events"),
		).toHaveLength(1);
	});
});

describe("runDueReminders — idempotent re-tick", () => {
	test("no due rows ⇒ no work, all counters zero", async () => {
		state.dueRows = [];
		const res = await runDueReminders(new Date("2026-06-20T08:55:00.000Z"));
		expect(res).toEqual({
			considered: 0,
			fired: 0,
			advanced: 0,
			skipped: 0,
			failed: 0,
		});
		expect(state.inserted).toHaveLength(0);
		expect(state.updated).toHaveLength(0);
	});

	test("two overlapping ticks over the SAME due row deliver EXACTLY ONCE (claim-first)", async () => {
		// Both ticks observe the same un-settled scheduled row (QStash retry, or a
		// run straddling the 5-min cadence). The claim `UPDATE ... RETURNING` is a
		// single-claimer: the first tick's claim wins (1 row) and delivers; the
		// second tick's identical claim loses (0 rows) and must NOT deliver — no
		// duplicate journal_events row, no duplicate email.
		const due = oneOffReminder();
		const now = new Date("2026-06-20T08:55:00.000Z");

		// First claim wins, second loses (FIFO over both runDueReminders calls).
		state.claimReturns = [1, 0];

		state.dueRows = [due];
		const first = await runDueReminders(now);

		state.dueRows = [due]; // same un-settled row re-selected by the overlap.
		const second = await runDueReminders(now);

		// Tick 1 claimed + delivered; tick 2 saw 0 rows and skipped delivery.
		expect(first.fired).toBe(1);
		expect(second.fired).toBe(0);
		expect(second.skipped).toBe(1);

		// THE INVARIANT: the in-app delivery (journal_events insert) happened once.
		const journalInserts = state.inserted.filter(
			(i) => i.table === "journal_events",
		);
		expect(journalInserts).toHaveLength(1);
	});

	test("the losing claim skips delivery even when it ran first in the fan-out", async () => {
		// Guard against ordering luck: if the very first claim a tick issues loses
		// (another worker already settled the row), there is still zero delivery.
		state.claimReturns = [0];
		state.dueRows = [oneOffReminder()];
		const res = await runDueReminders(new Date("2026-06-20T08:55:00.000Z"));

		expect(res.skipped).toBe(1);
		expect(res.fired).toBe(0);
		expect(res.advanced).toBe(0);
		expect(
			state.inserted.filter((i) => i.table === "journal_events"),
		).toHaveLength(0);
	});
});
