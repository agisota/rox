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
	inserted: { table: string; values: AnyRow[] }[];
	updated: { id: string; set: AnyRow }[];
} = {
	dueRows: [],
	inserted: [],
	updated: [],
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

// The due-scan: select().from(calReminders).innerJoin(calEvents)....limit().
function selectChain() {
	const p = Promise.resolve(state.dueRows) as Promise<AnyRow[]> &
		Record<string, (...a: unknown[]) => unknown>;
	p.from = () => p;
	p.innerJoin = () => p;
	p.where = () => p;
	p.orderBy = () => p;
	p.limit = () => p;
	return p;
}

// users lookup for the email path (unused on the inert path, present for safety).
function usersSelectChain() {
	const p = Promise.resolve([]) as Promise<AnyRow[]> &
		Record<string, (...a: unknown[]) => unknown>;
	p.from = () => p;
	p.where = () => p;
	p.limit = () => p;
	return p;
}

let selectMode: "due" | "users" = "due";

const fakeDb = {
	select() {
		const chain = selectMode === "users" ? usersSelectChain() : selectChain();
		return chain;
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
						return Promise.resolve();
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
	state.inserted = [];
	state.updated = [];
	selectMode = "due";
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
});
