import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// Stubs `@rox/db/client` so the suite needs no live database (mirrors
// comms.test.ts). A queue of result-sets drives each `select`; inserts/updates
// record their values and return configured rows.

type AnyRow = Record<string, unknown>;

const state: {
	selectQueue: AnyRow[][];
	inserted: { values: AnyRow[] }[];
	insertReturning: AnyRow[];
	updated: AnyRow[];
	updateReturning: AnyRow[];
} = {
	selectQueue: [],
	inserted: [],
	insertReturning: [{ id: "new-id" }],
	updated: [],
	updateReturning: [{ id: "attendee-1" }],
};

// Read a drizzle pgTable's name off its `Symbol(drizzle:Name)` so the stub can
// special-case the `members` table the REAL assertOrgMembers guard queries (the
// quota.test.ts pattern). Routing `members` by name keeps it OFF the positional
// `selectQueue` so the membership probe never shifts a result-set meant for a
// later router select.
function tableName(table: unknown): string {
	if (!table || typeof table !== "object") return "";
	const sym = Object.getOwnPropertySymbols(table).find(
		(s) => s.description === "drizzle:Name",
	);
	return sym ? String((table as Record<symbol, unknown>)[sym]) : "";
}

// assertOrgMembers runs `WHERE org=$1 AND user_id = ANY($userIds)`. Pull the
// bound param values out of the drizzle where-clause (each is a `Param` with a
// `value`/`encoder`); the first is the org id, the rest are the queried userIds.
function whereParamValues(clause: unknown): unknown[] {
	const out: unknown[] = [];
	const seen = new Set<unknown>();
	const walk = (o: unknown, depth = 0): void => {
		if (depth > 8 || !o || typeof o !== "object" || seen.has(o)) return;
		seen.add(o);
		const rec = o as Record<string, unknown>;
		if ("value" in rec && "encoder" in rec) out.push(rec.value);
		for (const v of Object.values(rec)) {
			if (Array.isArray(v)) for (const it of v) walk(it, depth + 1);
			else if (v && typeof v === "object") walk(v, depth + 1);
		}
	};
	walk(clause);
	return out;
}

// Echo back a `{ userId }` row for every userId in the `members` where-clause so
// the real guard sees every requested attendee as a member (happy path).
function membersFromWhere(clause: unknown): AnyRow[] {
	return whereParamValues(clause)
		.filter((v) => typeof v === "string")
		.slice(1) // drop the org id; the remainder are the queried userIds
		.map((userId) => ({ userId }));
}

function selectBuilder(rows: AnyRow[]) {
	const step = (): Promise<AnyRow[]> & Record<string, () => unknown> => {
		const p = Promise.resolve(rows) as Promise<AnyRow[]> &
			Record<string, () => unknown>;
		p.from = step;
		p.where = step;
		p.orderBy = step;
		p.innerJoin = step;
		p.leftJoin = step;
		p.limit = step;
		return p;
	};
	return step();
}

// Table-aware builder: the `members` membership probe resolves from its own
// where-clause (never the positional queue); every other table drains the queue.
function tableAwareSelect() {
	let queued: AnyRow[] | null = null;
	const resolveFor = (table: unknown): AnyRow[] => {
		if (tableName(table) === "members") return [];
		if (queued === null) queued = state.selectQueue.shift() ?? [];
		return queued;
	};
	const builder = {
		from(table: unknown) {
			const isMembers = tableName(table) === "members";
			const rows = resolveFor(table);
			const make = (): Promise<AnyRow[]> & Record<string, () => unknown> => {
				const p = Promise.resolve(rows) as Promise<AnyRow[]> &
					Record<string, () => unknown>;
				p.where = (clause?: unknown) =>
					isMembers ? selectBuilder(membersFromWhere(clause)) : make();
				p.orderBy = make;
				p.innerJoin = make;
				p.leftJoin = make;
				p.limit = make;
				return p;
			};
			return make();
		},
	};
	return builder;
}

function nextSelect() {
	return tableAwareSelect();
}

function insertChain() {
	return {
		values(vals: AnyRow | AnyRow[]) {
			const arr = Array.isArray(vals) ? vals : [vals];
			state.inserted.push({ values: arr });
			const chain = {
				onConflictDoNothing: () => chain,
				onConflictDoUpdate: () => chain,
				returning: () => Promise.resolve(state.insertReturning),
			};
			return chain;
		},
	};
}

function updateChain() {
	return {
		set(vals: AnyRow) {
			state.updated.push(vals);
			return {
				where: () => {
					const p = Promise.resolve(state.updateReturning) as Promise<
						AnyRow[]
					> & { returning: () => Promise<AnyRow[]> };
					p.returning = () => Promise.resolve(state.updateReturning);
					return p;
				},
			};
		},
	};
}

const fakeDb = {
	select: () => nextSelect(),
	insert: () => insertChain(),
	update: () => updateChain(),
	delete: () => ({ where: () => Promise.resolve() }),
	transaction: <T>(fn: (tx: typeof fakeDb) => Promise<T>) => fn(fakeDb),
};

mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
mock.module("../integration/utils", () => ({
	verifyOrgMembership: () => Promise.resolve({ membership: {} }),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
	verifyOrgAdmin: () => Promise.resolve({ membership: {} }),
	verifyOrgOwner: () => Promise.resolve({ membership: {} }),
}));

const { calendarRouter } = await import("./calendar");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ calendar: calendarRouter });
const createCaller = createCallerFactory(appRouter);

function callerFor(activeOrganizationId: string | null, userId = "user-1") {
	return createCaller({
		session: {
			user: { id: userId, email: "dev@rox.one" },
			session: { activeOrganizationId },
		},
		headers: new Headers(),
		// biome-ignore lint/suspicious/noExplicitAny: minimal test ctx
	} as any);
}

const CAL_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
	state.selectQueue = [];
	state.inserted = [];
	state.insertReturning = [{ id: "new-id" }];
	state.updated = [];
	state.updateReturning = [{ id: "attendee-1" }];
});

describe("calendar.listCalendars", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(caller.calendar.listCalendars()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("returns [] when the caller can read no calendars", async () => {
		state.selectQueue = [[], []]; // owned, shared
		const caller = callerFor("org-1");
		expect(await caller.calendar.listCalendars()).toEqual([]);
	});

	test("returns owned + shared calendars", async () => {
		state.selectQueue = [
			[{ id: CAL_ID }], // owned
			[{ id: "cal-shared" }], // shared
			[
				{ id: CAL_ID, name: "Mine" },
				{ id: "cal-shared", name: "Theirs" },
			], // fetch
		];
		const caller = callerFor("org-1");
		const res = await caller.calendar.listCalendars();
		expect(res).toHaveLength(2);
	});
});

describe("calendar.createCalendar", () => {
	test("inserts an org-scoped owned calendar", async () => {
		state.insertReturning = [{ id: CAL_ID, name: "Work" }];
		const caller = callerFor("org-1");
		const res = await caller.calendar.createCalendar({ name: "Work" });
		expect(res?.id).toBe(CAL_ID);
		expect(state.inserted[0]?.values[0]).toMatchObject({
			organizationId: "org-1",
			ownerUserId: "user-1",
			name: "Work",
		});
	});
});

describe("calendar.createEvent", () => {
	test("404s when the calendar is not in the org", async () => {
		state.selectQueue = [[]]; // resolveCalendarAccess → calendar lookup empty
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.createEvent({
				calendarId: CAL_ID,
				title: "Sync",
				dtstart: new Date("2026-06-20T09:00:00Z"),
				dtend: new Date("2026-06-20T10:00:00Z"),
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("forbids a member with no access grant", async () => {
		state.selectQueue = [
			[{ id: CAL_ID, ownerUserId: OTHER_USER, organizationId: "org-1" }], // calendar
			[], // share lookup → none
		];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.createEvent({
				calendarId: CAL_ID,
				title: "Sync",
				dtstart: new Date("2026-06-20T09:00:00Z"),
				dtend: new Date("2026-06-20T10:00:00Z"),
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("owner creates an event + organizer attendee", async () => {
		state.selectQueue = [
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar (owner)
		];
		state.insertReturning = [{ id: EVENT_ID, title: "Sync" }];
		const caller = callerFor("org-1");
		const res = await caller.calendar.createEvent({
			calendarId: CAL_ID,
			title: "Sync",
			dtstart: new Date("2026-06-20T09:00:00Z"),
			dtend: new Date("2026-06-20T10:00:00Z"),
			attendees: [{ kind: "email", email: "guest@example.com" }],
		});
		expect(res?.id).toBe(EVENT_ID);
		// event insert + attendee insert.
		expect(state.inserted.length).toBeGreaterThanOrEqual(2);
		const attendeeRows = state.inserted[1]?.values ?? [];
		expect(attendeeRows.some((r) => r.isOrganizer === true)).toBe(true);
		expect(attendeeRows.some((r) => r.email === "guest@example.com")).toBe(
			true,
		);
	});

	test("resolves an @handle attendee to its userId (C8)", async () => {
		state.selectQueue = [
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar (owner)
			[{ userId: OTHER_USER, handle: "alice" }], // resolveAttendees handle lookup
		];
		state.insertReturning = [{ id: EVENT_ID, title: "Sync" }];
		const caller = callerFor("org-1");
		await caller.calendar.createEvent({
			calendarId: CAL_ID,
			title: "Sync",
			dtstart: new Date("2026-06-20T09:00:00Z"),
			dtend: new Date("2026-06-20T10:00:00Z"),
			attendees: [{ kind: "handle", handle: "@Alice" }],
		});
		const attendeeRows = state.inserted[1]?.values ?? [];
		expect(attendeeRows.some((r) => r.userId === OTHER_USER)).toBe(true);
	});

	test("rejects an unknown @handle attendee (C8)", async () => {
		state.selectQueue = [
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar
			[], // handle lookup → none
		];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.createEvent({
				calendarId: CAL_ID,
				title: "Sync",
				dtstart: new Date("2026-06-20T09:00:00Z"),
				dtend: new Date("2026-06-20T10:00:00Z"),
				attendees: [{ kind: "handle", handle: "ghost" }],
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("rejects dtend before dtstart", async () => {
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.createEvent({
				calendarId: CAL_ID,
				title: "Bad",
				dtstart: new Date("2026-06-20T10:00:00Z"),
				dtend: new Date("2026-06-20T09:00:00Z"),
			}),
		).rejects.toThrow();
	});
});

describe("calendar.rsvp", () => {
	test("sets the caller's RSVP on an event they attend", async () => {
		state.selectQueue = [
			[{ id: EVENT_ID, calendarId: CAL_ID, organizationId: "org-1" }], // event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
		];
		state.updateReturning = [{ id: "attendee-1" }];
		const caller = callerFor("org-1");
		const res = await caller.calendar.rsvp({
			eventId: EVENT_ID,
			status: "accepted",
		});
		expect(res.ok).toBe(true);
		expect(state.updated[0]?.status).toBe("accepted");
	});

	test("forbids a non-attendee (no row updated)", async () => {
		state.selectQueue = [
			[{ id: EVENT_ID, calendarId: CAL_ID, organizationId: "org-1" }], // event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access (reader via owner)
		];
		state.updateReturning = []; // matched no attendee row
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.rsvp({ eventId: EVENT_ID, status: "declined" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("calendar.listOccurrences", () => {
	test("expands recurring events in the requested range", async () => {
		state.selectQueue = [
			[{ id: CAL_ID }], // owned
			[], // shared
			[
				{
					id: EVENT_ID,
					calendarId: CAL_ID,
					organizationId: "org-1",
					dtstart: new Date("2026-06-01T09:00:00Z"),
					dtend: new Date("2026-06-01T10:00:00Z"),
					timezone: "UTC",
					rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
					exdates: [],
					status: "confirmed",
				},
			], // events
			[], // per-occurrence overrides for recurring events (none)
		];
		const caller = callerFor("org-1");
		const res = await caller.calendar.listOccurrences({
			rangeStart: new Date("2026-06-01T00:00:00Z"),
			rangeEnd: new Date("2026-06-04T00:00:00Z"),
		});
		expect(res.occurrences).toHaveLength(3);
		expect(res.occurrences[0]?.start).toBe("2026-06-01T09:00:00.000Z");
		// Additive RECURRENCE-ID + override flag surfaced on every instance.
		expect(res.occurrences[0]?.originalStart).toBe("2026-06-01T09:00:00.000Z");
		expect(res.occurrences[0]?.overridden).toBe(false);
	});

	test("applies per-occurrence overrides: cancels one instance and patches another", async () => {
		state.selectQueue = [
			[{ id: CAL_ID }], // owned
			[], // shared
			[
				{
					id: EVENT_ID,
					calendarId: CAL_ID,
					organizationId: "org-1",
					dtstart: new Date("2026-06-01T09:00:00Z"),
					dtend: new Date("2026-06-01T10:00:00Z"),
					timezone: "UTC",
					rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
					exdates: [],
					status: "confirmed",
				},
			], // events
			[
				// Jun 2 cancelled.
				{
					eventId: EVENT_ID,
					originalStart: new Date("2026-06-02T09:00:00Z"),
					cancelled: true,
					overrideDtstart: null,
					overrideDtend: null,
					overrideTitle: null,
					overrideDescription: null,
					overrideLocation: null,
					overrideAllDay: null,
				},
				// Jun 3 moved to 14:00.
				{
					eventId: EVENT_ID,
					originalStart: new Date("2026-06-03T09:00:00Z"),
					cancelled: false,
					overrideDtstart: new Date("2026-06-03T14:00:00Z"),
					overrideDtend: new Date("2026-06-03T15:00:00Z"),
					overrideTitle: null,
					overrideDescription: null,
					overrideLocation: null,
					overrideAllDay: null,
				},
			], // overrides
		];
		const caller = callerFor("org-1");
		const res = await caller.calendar.listOccurrences({
			rangeStart: new Date("2026-06-01T00:00:00Z"),
			rangeEnd: new Date("2026-06-04T00:00:00Z"),
		});
		const starts = res.occurrences.map((o) => o.start);
		// Jun 2 absent (cancelled); Jun 3 patched to 14:00.
		expect(starts).toEqual([
			"2026-06-01T09:00:00.000Z",
			"2026-06-03T14:00:00.000Z",
		]);
		const moved = res.occurrences.find(
			(o) => o.start === "2026-06-03T14:00:00.000Z",
		);
		expect(moved?.originalStart).toBe("2026-06-03T09:00:00.000Z");
		expect(moved?.overridden).toBe(true);
	});

	// MED regression: a "this event only" field override (title/description/
	// location/allDay) is persisted but was never surfaced by listOccurrences, so
	// the edited instance looked unchanged. The override fields must now land on
	// the matching instance ONLY; sibling instances stay on the series values.
	test("surfaces per-occurrence field overrides on the right instance only", async () => {
		state.selectQueue = [
			[{ id: CAL_ID }], // owned
			[], // shared
			[
				{
					id: EVENT_ID,
					calendarId: CAL_ID,
					organizationId: "org-1",
					dtstart: new Date("2026-06-01T09:00:00Z"),
					dtend: new Date("2026-06-01T10:00:00Z"),
					timezone: "UTC",
					rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
					exdates: [],
					status: "confirmed",
				},
			], // events
			[
				// Jun 2: field-only override (no time move) — title/description/
				// location/allDay patched, dtstart/dtend null (inherit the slot).
				{
					eventId: EVENT_ID,
					originalStart: new Date("2026-06-02T09:00:00Z"),
					cancelled: false,
					overrideDtstart: null,
					overrideDtend: null,
					overrideTitle: "Special standup",
					overrideDescription: "One-off agenda",
					overrideLocation: "Room 9",
					overrideAllDay: true,
				},
			], // overrides
		];
		const caller = callerFor("org-1");
		const res = await caller.calendar.listOccurrences({
			rangeStart: new Date("2026-06-01T00:00:00Z"),
			rangeEnd: new Date("2026-06-04T00:00:00Z"),
		});
		const patched = res.occurrences.find(
			(o) => o.originalStart === "2026-06-02T09:00:00.000Z",
		);
		// The edited instance reflects the override fields…
		expect(patched?.title).toBe("Special standup");
		expect(patched?.description).toBe("One-off agenda");
		expect(patched?.location).toBe("Room 9");
		expect(patched?.allDay).toBe(true);
		expect(patched?.overridden).toBe(true);
		// …and it stays on its own slot (no teleport).
		expect(patched?.start).toBe("2026-06-02T09:00:00.000Z");
		// Sibling instances are untouched: no override fields surfaced.
		const sibling = res.occurrences.find(
			(o) => o.originalStart === "2026-06-01T09:00:00.000Z",
		);
		expect(sibling?.title).toBeUndefined();
		expect(sibling?.location).toBeUndefined();
		expect(sibling?.allDay).toBeUndefined();
		expect(sibling?.overridden).toBe(false);
	});

	test("returns empty when the caller can read no calendars", async () => {
		state.selectQueue = [[], []]; // owned, shared
		const caller = callerFor("org-1");
		const res = await caller.calendar.listOccurrences({
			rangeStart: new Date("2026-06-01T00:00:00Z"),
			rangeEnd: new Date("2026-06-04T00:00:00Z"),
		});
		expect(res.occurrences).toEqual([]);
	});
});

describe("calendar.updateOccurrence", () => {
	const RECURRING_EVENT = {
		id: EVENT_ID,
		calendarId: CAL_ID,
		organizationId: "org-1",
		dtstart: new Date("2026-06-01T09:00:00Z"),
		dtend: new Date("2026-06-01T10:00:00Z"),
		timezone: "UTC",
		rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
		exdates: [],
		status: "confirmed",
	};
	const ORIGINAL_START = new Date("2026-06-02T09:00:00Z");

	test("404s when the event is not in the org", async () => {
		state.selectQueue = [[]]; // getEventWithAccess → event lookup empty
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.updateOccurrence({
				eventId: EVENT_ID,
				originalStart: ORIGINAL_START,
				title: "Moved",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("forbids a member with no access grant", async () => {
		state.selectQueue = [
			[RECURRING_EVENT], // event
			[{ id: CAL_ID, ownerUserId: OTHER_USER, organizationId: "org-1" }], // calendar (not owner)
			[], // share lookup → none
		];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.updateOccurrence({
				eventId: EVENT_ID,
				originalStart: ORIGINAL_START,
				title: "Moved",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("BAD_REQUEST when the event is not recurring (rrule null)", async () => {
		state.selectQueue = [
			[{ ...RECURRING_EVENT, rrule: null }], // one-off event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar (owner)
		];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.updateOccurrence({
				eventId: EVENT_ID,
				originalStart: ORIGINAL_START,
				title: "Moved",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("upserts an override row forcing ownerUserId to the caller", async () => {
		state.selectQueue = [
			[RECURRING_EVENT], // event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar (owner)
		];
		state.insertReturning = [{ id: "override-1", eventId: EVENT_ID }];
		const caller = callerFor("org-1", "user-1");
		await caller.calendar.updateOccurrence({
			eventId: EVENT_ID,
			originalStart: ORIGINAL_START,
			title: "Moved sync",
			dtstart: new Date("2026-06-02T14:00:00Z"),
			dtend: new Date("2026-06-02T15:00:00Z"),
		});
		const values = state.inserted[0]?.values[0];
		expect(values).toMatchObject({
			organizationId: "org-1",
			eventId: EVENT_ID,
			ownerUserId: "user-1",
			cancelled: false,
			overrideTitle: "Moved sync",
		});
		expect((values?.originalStart as Date).toISOString()).toBe(
			"2026-06-02T09:00:00.000Z",
		);
		expect((values?.overrideDtstart as Date).toISOString()).toBe(
			"2026-06-02T14:00:00.000Z",
		);
	});

	// HIGH regression: editing the 2nd instance with NO time change must not
	// "teleport" it to the series start. A buggy client seeds the dialog from the
	// series anchor (Jun 1 09:00) and would send that as this instance's
	// dtstart/dtend; the server guard drops a time override that lands on the
	// instance's own natural slot, so overrideDtstart/Dtend persist as NULL
	// (inherit) and the instance keeps Jun 2 — never jumps to Jun 1.
	test("a no-time-change edit of the 2nd instance does not teleport it (anchor-seeded)", async () => {
		state.selectQueue = [
			[RECURRING_EVENT], // event (anchor Jun 1 09:00–10:00)
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar (owner)
		];
		state.insertReturning = [{ id: "override-1", eventId: EVENT_ID }];
		const caller = callerFor("org-1", "user-1");
		await caller.calendar.updateOccurrence({
			eventId: EVENT_ID,
			originalStart: ORIGINAL_START, // Jun 2 09:00 (the clicked instance)
			title: "Renamed only",
			// Buggy/anchor-seeded payload: the SERIES anchor, not the instance.
			dtstart: new Date("2026-06-01T09:00:00Z"),
			dtend: new Date("2026-06-01T10:00:00Z"),
		});
		const values = state.inserted[0]?.values[0];
		// The field edit persists…
		expect(values?.overrideTitle).toBe("Renamed only");
		// …but the bogus anchor time override is dropped (inherit the series),
		// so the expander keeps the instance on its own Jun 2 slot.
		expect(values?.overrideDtstart).toBeNull();
		expect(values?.overrideDtend).toBeNull();
		expect((values?.originalStart as Date).toISOString()).toBe(
			"2026-06-02T09:00:00.000Z",
		);
	});

	// The instance's own natural slot (originalStart + series duration) is not a
	// move either; an unmoved edit seeded correctly from the instance still stores
	// no time override.
	test("an edit on the instance's natural slot stores no time override", async () => {
		state.selectQueue = [
			[RECURRING_EVENT], // event (1h series duration)
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar (owner)
		];
		state.insertReturning = [{ id: "override-1", eventId: EVENT_ID }];
		const caller = callerFor("org-1", "user-1");
		await caller.calendar.updateOccurrence({
			eventId: EVENT_ID,
			originalStart: ORIGINAL_START, // Jun 2 09:00
			location: "Room 7",
			dtstart: new Date("2026-06-02T09:00:00Z"), // == natural slot start
			dtend: new Date("2026-06-02T10:00:00Z"), // == natural slot end (+1h)
		});
		const values = state.inserted[0]?.values[0];
		expect(values?.overrideLocation).toBe("Room 7");
		expect(values?.overrideDtstart).toBeNull();
		expect(values?.overrideDtend).toBeNull();
	});

	// A genuine move of the 2nd instance to a different time is stored verbatim.
	test("a real time move of the 2nd instance is stored verbatim", async () => {
		state.selectQueue = [
			[RECURRING_EVENT], // event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar (owner)
		];
		state.insertReturning = [{ id: "override-1", eventId: EVENT_ID }];
		const caller = callerFor("org-1", "user-1");
		await caller.calendar.updateOccurrence({
			eventId: EVENT_ID,
			originalStart: ORIGINAL_START, // Jun 2 09:00
			dtstart: new Date("2026-06-02T14:00:00Z"), // moved to 14:00
			dtend: new Date("2026-06-02T15:00:00Z"),
		});
		const values = state.inserted[0]?.values[0];
		expect((values?.overrideDtstart as Date).toISOString()).toBe(
			"2026-06-02T14:00:00.000Z",
		);
		expect((values?.overrideDtend as Date).toISOString()).toBe(
			"2026-06-02T15:00:00.000Z",
		);
	});
});

describe("calendar.cancelOccurrence", () => {
	const RECURRING_EVENT = {
		id: EVENT_ID,
		calendarId: CAL_ID,
		organizationId: "org-1",
		dtstart: new Date("2026-06-01T09:00:00Z"),
		dtend: new Date("2026-06-01T10:00:00Z"),
		timezone: "UTC",
		rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
		exdates: [],
		status: "confirmed",
	};
	const ORIGINAL_START = new Date("2026-06-02T09:00:00Z");

	test("forbids a reader (writer access required)", async () => {
		state.selectQueue = [
			[RECURRING_EVENT], // event
			[{ id: CAL_ID, ownerUserId: OTHER_USER, organizationId: "org-1" }], // calendar
			[{ role: "reader" }], // share → reader only
		];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.cancelOccurrence({
				eventId: EVENT_ID,
				originalStart: ORIGINAL_START,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("404s for a non-org user", async () => {
		state.selectQueue = [[]]; // event lookup empty
		const caller = callerFor("org-1", OTHER_USER);
		await expect(
			caller.calendar.cancelOccurrence({
				eventId: EVENT_ID,
				originalStart: ORIGINAL_START,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("upserts a cancelled override row", async () => {
		state.selectQueue = [
			[RECURRING_EVENT], // event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar (owner)
		];
		state.insertReturning = [{ id: "override-1" }];
		const caller = callerFor("org-1", "user-1");
		const res = await caller.calendar.cancelOccurrence({
			eventId: EVENT_ID,
			originalStart: ORIGINAL_START,
		});
		expect(res.ok).toBe(true);
		const values = state.inserted[0]?.values[0];
		expect(values).toMatchObject({
			organizationId: "org-1",
			eventId: EVENT_ID,
			ownerUserId: "user-1",
			cancelled: true,
		});
	});
});

describe("calendar.deleteOccurrenceOverride", () => {
	const RECURRING_EVENT = {
		id: EVENT_ID,
		calendarId: CAL_ID,
		organizationId: "org-1",
		dtstart: new Date("2026-06-01T09:00:00Z"),
		dtend: new Date("2026-06-01T10:00:00Z"),
		timezone: "UTC",
		rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
		exdates: [],
		status: "confirmed",
	};

	test("deletes the override row and returns ok", async () => {
		state.selectQueue = [
			[RECURRING_EVENT], // event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar (owner)
		];
		const caller = callerFor("org-1", "user-1");
		const res = await caller.calendar.deleteOccurrenceOverride({
			eventId: EVENT_ID,
			originalStart: new Date("2026-06-02T09:00:00Z"),
		});
		expect(res.ok).toBe(true);
	});
});

describe("calendar.exportIcs", () => {
	test("returns a VCALENDAR for a readable calendar", async () => {
		state.selectQueue = [
			[
				{
					id: CAL_ID,
					ownerUserId: "user-1",
					organizationId: "org-1",
					name: "Work",
				},
			], // calendar
			[
				{
					id: EVENT_ID,
					title: "Sync",
					description: null,
					location: null,
					dtstart: new Date("2026-06-20T09:00:00Z"),
					dtend: new Date("2026-06-20T10:00:00Z"),
					allDay: false,
					rrule: null,
					exdates: [],
				},
			], // events
		];
		const caller = callerFor("org-1");
		const res = await caller.calendar.exportIcs({ calendarId: CAL_ID });
		expect(res.ics).toContain("BEGIN:VCALENDAR");
		expect(res.ics).toContain("SUMMARY:Sync");
		expect(res.filename).toBe("Work.ics");
	});
});

describe("calendar.createReminder", () => {
	// Far-future anchor so computeNextFireAt always yields a future fire instant.
	const FUTURE_EVENT = {
		id: EVENT_ID,
		calendarId: CAL_ID,
		organizationId: "org-1",
		dtstart: new Date("2999-06-20T09:00:00Z"),
		dtend: new Date("2999-06-20T10:00:00Z"),
		timezone: "UTC",
		rrule: null,
		exdates: [],
		status: "confirmed",
	};

	test("404s when the event is not readable", async () => {
		state.selectQueue = [[]]; // getEventWithAccess → event lookup empty
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.createReminder({
				eventId: EVENT_ID,
				channel: "in_app",
				trigger: "relative",
				offsetMinutes: 10,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("forces owner_user_id to the caller and persists next_fire_at", async () => {
		state.selectQueue = [
			[FUTURE_EVENT], // event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
			[{ value: 0 }], // per-event reminder count
		];
		state.insertReturning = [{ id: "reminder-1" }];
		const caller = callerFor("org-1", "user-1");
		const res = await caller.calendar.createReminder({
			eventId: EVENT_ID,
			channel: "in_app",
			trigger: "relative",
			offsetMinutes: 10,
		});
		expect(res?.id).toBe("reminder-1");
		const values = state.inserted[0]?.values[0];
		expect(values).toMatchObject({
			organizationId: "org-1",
			eventId: EVENT_ID,
			ownerUserId: "user-1",
			channel: "in_app",
			triggerKind: "relative",
			offsetMinutes: 10,
			status: "scheduled",
		});
		// next_fire_at = dtstart - 10min, materialized by computeNextFireAt.
		expect((values?.nextFireAt as Date).toISOString()).toBe(
			"2999-06-20T08:50:00.000Z",
		);
		expect(values?.absoluteFireAt).toBeNull();
	});

	test("rejects when the per-event reminder cap is reached", async () => {
		state.selectQueue = [
			[FUTURE_EVENT], // event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
			[{ value: 10 }], // already at the cap
		];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.createReminder({
				eventId: EVENT_ID,
				channel: "in_app",
				trigger: "relative",
				offsetMinutes: 10,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("rejects a relative reminder with no offsetMinutes (XOR)", async () => {
		const caller = callerFor("org-1");
		await expect(
			// @ts-expect-error deliberately omit offsetMinutes to hit the refine
			caller.calendar.createReminder({
				eventId: EVENT_ID,
				channel: "in_app",
				trigger: "relative",
			}),
		).rejects.toThrow();
	});

	test("rejects a relative reminder that also sets absoluteFireAt (XOR)", async () => {
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.createReminder({
				eventId: EVENT_ID,
				channel: "in_app",
				trigger: "relative",
				offsetMinutes: 10,
				absoluteFireAt: new Date("2999-06-20T08:00:00Z"),
			}),
		).rejects.toThrow();
	});

	test("rejects an absolute reminder with no absoluteFireAt (XOR)", async () => {
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.createReminder({
				eventId: EVENT_ID,
				channel: "in_app",
				trigger: "absolute",
			}),
		).rejects.toThrow();
	});

	test("rejects when the computed fire instant is already in the past", async () => {
		state.selectQueue = [
			[
				{
					...FUTURE_EVENT,
					dtstart: new Date("2000-01-01T09:00:00Z"),
					dtend: new Date("2000-01-01T10:00:00Z"),
				},
			], // event in the past
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
			[{ value: 0 }], // count
		];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.createReminder({
				eventId: EVENT_ID,
				channel: "in_app",
				trigger: "relative",
				offsetMinutes: 10,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

describe("calendar.listReminders", () => {
	test("returns the caller's own reminders for a readable event", async () => {
		state.selectQueue = [
			[{ id: EVENT_ID, calendarId: CAL_ID, organizationId: "org-1" }], // event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
			[{ id: "reminder-1", ownerUserId: "user-1", eventId: EVENT_ID }], // reminders
		];
		const caller = callerFor("org-1", "user-1");
		const res = await caller.calendar.listReminders({ eventId: EVENT_ID });
		expect(res).toHaveLength(1);
		expect(res[0]?.ownerUserId).toBe("user-1");
	});

	test("404s when the event is not readable (cannot peek another user's reminders)", async () => {
		state.selectQueue = [[]]; // event lookup empty → NOT_FOUND
		const caller = callerFor("org-1", OTHER_USER);
		await expect(
			caller.calendar.listReminders({ eventId: EVENT_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("calendar.updateReminder", () => {
	test("404s when the reminder is not the caller's own", async () => {
		state.selectQueue = [[]]; // reminder lookup (org + owner scoped) empty
		const caller = callerFor("org-1", OTHER_USER);
		await expect(
			caller.calendar.updateReminder({
				reminderId: "55555555-5555-4555-8555-555555555555",
				trigger: "relative",
				offsetMinutes: 30,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("recomputes next_fire_at from the new offset", async () => {
		state.selectQueue = [
			[
				{
					id: "55555555-5555-4555-8555-555555555555",
					organizationId: "org-1",
					ownerUserId: "user-1",
					eventId: EVENT_ID,
					triggerKind: "relative",
					offsetMinutes: 10,
					absoluteFireAt: null,
				},
			], // reminder
			[
				{
					id: EVENT_ID,
					calendarId: CAL_ID,
					organizationId: "org-1",
					dtstart: new Date("2999-06-20T09:00:00Z"),
					dtend: new Date("2999-06-20T10:00:00Z"),
					timezone: "UTC",
					rrule: null,
					exdates: [],
					status: "confirmed",
				},
			], // event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
		];
		state.updateReturning = [{ id: "55555555-5555-4555-8555-555555555555" }];
		const caller = callerFor("org-1", "user-1");
		await caller.calendar.updateReminder({
			reminderId: "55555555-5555-4555-8555-555555555555",
			trigger: "relative",
			offsetMinutes: 60,
		});
		// next_fire_at = dtstart - 60min.
		expect((state.updated[0]?.nextFireAt as Date).toISOString()).toBe(
			"2999-06-20T08:00:00.000Z",
		);
		expect(state.updated[0]?.offsetMinutes).toBe(60);
		expect(state.updated[0]?.status).toBe("scheduled");
	});
});

describe("calendar.updateEvent reminder recompute (#528)", () => {
	const REMINDER_ID = "66666666-6666-4666-8666-666666666666";

	test("recomputes scheduled relative reminders' next_fire_at on a dtstart reschedule", async () => {
		// Reschedule the one-off event from 09:00 → 12:00 (far future so fires stay
		// in the future). A relative reminder fires 30min before dtstart, so its
		// next_fire_at must move 11:30, not stay at the old 08:30.
		const updatedEvent = {
			id: EVENT_ID,
			calendarId: CAL_ID,
			organizationId: "org-1",
			dtstart: new Date("2999-06-20T12:00:00Z"),
			dtend: new Date("2999-06-20T13:00:00Z"),
			timezone: "UTC",
			rrule: null,
			exdates: [],
			status: "confirmed",
		};
		state.selectQueue = [
			[
				{
					...updatedEvent,
					dtstart: new Date("2999-06-20T09:00:00Z"),
					dtend: new Date("2999-06-20T10:00:00Z"),
				},
			], // getEventWithAccess → existing event (pre-update)
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
			[
				{
					id: REMINDER_ID,
					organizationId: "org-1",
					eventId: EVENT_ID,
					ownerUserId: "user-1",
					triggerKind: "relative",
					offsetMinutes: 30,
					absoluteFireAt: null,
					status: "scheduled",
				},
			], // recomputeRemindersForEvent → scheduled reminders
		];
		// The event update's `.returning()` yields the NEW row the recompute reads.
		state.updateReturning = [updatedEvent];
		const caller = callerFor("org-1", "user-1");
		await caller.calendar.updateEvent({
			eventId: EVENT_ID,
			dtstart: new Date("2999-06-20T12:00:00Z"),
			dtend: new Date("2999-06-20T13:00:00Z"),
		});
		// state.updated[0] = the event row update; [1] = the reminder recompute.
		const reminderSet = state.updated[1];
		expect(reminderSet).toBeDefined();
		expect((reminderSet?.nextFireAt as Date).toISOString()).toBe(
			"2999-06-20T11:30:00.000Z",
		);
	});

	test("recomputes on an rrule change (series start moves the relative fire)", async () => {
		// A weekly series anchored 2999-06-20T09:00Z; a reminder fires 15min before
		// the first future occurrence. Changing the rule to a later byhour shifts the
		// computed occurrence and therefore the reminder's next_fire_at.
		const updatedEvent = {
			id: EVENT_ID,
			calendarId: CAL_ID,
			organizationId: "org-1",
			dtstart: new Date("2999-06-20T09:00:00Z"),
			dtend: new Date("2999-06-20T10:00:00Z"),
			timezone: "UTC",
			rrule: "FREQ=DAILY",
			exdates: [],
			status: "confirmed",
		};
		state.selectQueue = [
			[{ ...updatedEvent, rrule: "FREQ=WEEKLY" }], // existing event (pre-update)
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
			[
				{
					id: REMINDER_ID,
					organizationId: "org-1",
					eventId: EVENT_ID,
					ownerUserId: "user-1",
					triggerKind: "relative",
					offsetMinutes: 15,
					absoluteFireAt: null,
					status: "scheduled",
				},
			], // scheduled reminders
		];
		state.updateReturning = [updatedEvent];
		const caller = callerFor("org-1", "user-1");
		await caller.calendar.updateEvent({
			eventId: EVENT_ID,
			rrule: "FREQ=DAILY",
		});
		const reminderSet = state.updated[1];
		expect(reminderSet).toBeDefined();
		// First future DAILY occurrence at 09:00Z − 15min fire instant is written.
		expect(reminderSet?.nextFireAt).toBeInstanceOf(Date);
		expect((reminderSet?.nextFireAt as Date).getUTCMinutes()).toBe(45);
	});

	test("retires a reminder whose fire instant is now in the past after the reschedule", async () => {
		// Move the one-off event into the PAST → the relative fire has no future
		// instant, so the scheduled reminder must flip to `fired`, not keep a stale
		// future next_fire_at.
		const updatedEvent = {
			id: EVENT_ID,
			calendarId: CAL_ID,
			organizationId: "org-1",
			dtstart: new Date("2000-01-01T09:00:00Z"),
			dtend: new Date("2000-01-01T10:00:00Z"),
			timezone: "UTC",
			rrule: null,
			exdates: [],
			status: "confirmed",
		};
		state.selectQueue = [
			[
				{
					...updatedEvent,
					dtstart: new Date("2999-06-20T09:00:00Z"),
					dtend: new Date("2999-06-20T10:00:00Z"),
				},
			], // existing event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
			[
				{
					id: REMINDER_ID,
					organizationId: "org-1",
					eventId: EVENT_ID,
					ownerUserId: "user-1",
					triggerKind: "relative",
					offsetMinutes: 30,
					absoluteFireAt: null,
					status: "scheduled",
				},
			], // scheduled reminders
		];
		state.updateReturning = [updatedEvent];
		const caller = callerFor("org-1", "user-1");
		await caller.calendar.updateEvent({
			eventId: EVENT_ID,
			dtstart: new Date("2000-01-01T09:00:00Z"),
			dtend: new Date("2000-01-01T10:00:00Z"),
		});
		const reminderSet = state.updated[1];
		expect(reminderSet).toBeDefined();
		expect(reminderSet?.status).toBe("fired");
		expect(reminderSet?.nextFireAt).toBeUndefined();
	});

	test("leaves absolute reminders untouched (their fire is anchor-independent)", async () => {
		const updatedEvent = {
			id: EVENT_ID,
			calendarId: CAL_ID,
			organizationId: "org-1",
			dtstart: new Date("2999-06-20T12:00:00Z"),
			dtend: new Date("2999-06-20T13:00:00Z"),
			timezone: "UTC",
			rrule: null,
			exdates: [],
			status: "confirmed",
		};
		state.selectQueue = [
			[
				{
					...updatedEvent,
					dtstart: new Date("2999-06-20T09:00:00Z"),
					dtend: new Date("2999-06-20T10:00:00Z"),
				},
			], // existing event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
			[
				{
					id: REMINDER_ID,
					organizationId: "org-1",
					eventId: EVENT_ID,
					ownerUserId: "user-1",
					triggerKind: "absolute",
					offsetMinutes: null,
					absoluteFireAt: new Date("2999-12-31T00:00:00Z"),
					status: "scheduled",
				},
			], // scheduled reminders (absolute)
		];
		state.updateReturning = [updatedEvent];
		const caller = callerFor("org-1", "user-1");
		await caller.calendar.updateEvent({
			eventId: EVENT_ID,
			dtstart: new Date("2999-06-20T12:00:00Z"),
			dtend: new Date("2999-06-20T13:00:00Z"),
		});
		// Only the event row was updated; the absolute reminder was skipped.
		expect(state.updated).toHaveLength(1);
	});

	test("does NOT touch reminders on a metadata-only edit (title change, same timing)", async () => {
		// A title-only update must not re-query or re-write reminders at all: only
		// the event row is updated, so no second `set` is recorded.
		const event = {
			id: EVENT_ID,
			calendarId: CAL_ID,
			organizationId: "org-1",
			title: "renamed",
			dtstart: new Date("2999-06-20T09:00:00Z"),
			dtend: new Date("2999-06-20T10:00:00Z"),
			timezone: "UTC",
			rrule: null,
			exdates: [],
			status: "confirmed",
		};
		state.selectQueue = [
			[event], // existing event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
		];
		state.updateReturning = [event];
		const caller = callerFor("org-1", "user-1");
		await caller.calendar.updateEvent({ eventId: EVENT_ID, title: "renamed" });
		// Only the event row update was recorded — reminders left alone.
		expect(state.updated).toHaveLength(1);
	});

	test("does NOT recompute when dtstart is re-sent unchanged (no real delta)", async () => {
		// Sending the same dtstart back is a no-op for timing → no reminder writes.
		const event = {
			id: EVENT_ID,
			calendarId: CAL_ID,
			organizationId: "org-1",
			dtstart: new Date("2999-06-20T09:00:00Z"),
			dtend: new Date("2999-06-20T10:00:00Z"),
			timezone: "UTC",
			rrule: null,
			exdates: [],
			status: "confirmed",
		};
		state.selectQueue = [
			[event], // existing event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
		];
		state.updateReturning = [event];
		const caller = callerFor("org-1", "user-1");
		await caller.calendar.updateEvent({
			eventId: EVENT_ID,
			dtstart: new Date("2999-06-20T09:00:00Z"),
		});
		expect(state.updated).toHaveLength(1);
	});
});

describe("calendar.deleteReminder", () => {
	test("deletes scoped by org + owner and returns ok", async () => {
		const caller = callerFor("org-1", "user-1");
		const res = await caller.calendar.deleteReminder({
			reminderId: "55555555-5555-4555-8555-555555555555",
		});
		expect(res.ok).toBe(true);
	});
});

describe("calendar.shareCalendar", () => {
	test("owner grants a role to a member", async () => {
		state.selectQueue = [
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar (owner)
		];
		state.insertReturning = [{ id: "share-1", role: "writer" }];
		const caller = callerFor("org-1");
		const res = await caller.calendar.shareCalendar({
			calendarId: CAL_ID,
			userId: OTHER_USER,
			role: "writer",
		});
		expect(res?.role).toBe("writer");
	});

	test("forbids a non-owner from sharing", async () => {
		state.selectQueue = [
			[{ id: CAL_ID, ownerUserId: OTHER_USER, organizationId: "org-1" }], // calendar
			[{ role: "writer" }], // caller has writer (not owner)
		];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.shareCalendar({
				calendarId: CAL_ID,
				userId: "44444444-4444-4444-8444-444444444444",
				role: "reader",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("calendar.enableCalendarFeed", () => {
	test("owner enables → returns a token + public URL", async () => {
		state.selectQueue = [
			[
				{
					id: CAL_ID,
					ownerUserId: "user-1",
					organizationId: "org-1",
					feedToken: null,
					feedTokenCreatedAt: null,
					feedBusyOnly: false,
				},
			], // calendar (owner, feed disabled)
		];
		// enableCalendarFeed returns the persisted token.
		state.updateReturning = [{ feedToken: "tok_generated" }];
		const caller = callerFor("org-1");
		const res = await caller.calendar.enableCalendarFeed({
			calendarId: CAL_ID,
			busyOnly: true,
		});
		expect(typeof res.token).toBe("string");
		expect(res.token.length).toBeGreaterThan(0);
		expect(res.url).toContain(`/calendar/feed/${res.token}`);
		expect(res.busyOnly).toBe(true);
		// The update sets a non-null token + the busy-only flag.
		expect(state.updated[0]?.feedToken).toBeTruthy();
		expect(state.updated[0]?.feedBusyOnly).toBe(true);
	});

	test("re-enable keeps the existing token (published URL survives)", async () => {
		state.selectQueue = [
			[
				{
					id: CAL_ID,
					ownerUserId: "user-1",
					organizationId: "org-1",
					feedToken: "existing_tok",
					feedTokenCreatedAt: new Date("2026-06-01T00:00:00Z"),
					feedBusyOnly: false,
				},
			], // calendar (owner, feed already enabled)
		];
		state.updateReturning = [{ feedToken: "existing_tok" }];
		const caller = callerFor("org-1");
		const res = await caller.calendar.enableCalendarFeed({
			calendarId: CAL_ID,
		});
		expect(res.token).toBe("existing_tok");
		expect(state.updated[0]?.feedToken).toBe("existing_tok");
	});

	test("404s when the calendar is not in the org", async () => {
		state.selectQueue = [[]]; // resolveCalendarAccess → empty
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.enableCalendarFeed({ calendarId: CAL_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("forbids a non-owner member (reader/writer)", async () => {
		state.selectQueue = [
			[{ id: CAL_ID, ownerUserId: OTHER_USER, organizationId: "org-1" }], // calendar
			[{ role: "writer" }], // caller has writer (not owner)
		];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.enableCalendarFeed({ calendarId: CAL_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("calendar.rotateCalendarFeed", () => {
	test("owner rotate replaces the token", async () => {
		state.selectQueue = [
			[
				{
					id: CAL_ID,
					ownerUserId: "user-1",
					organizationId: "org-1",
					feedToken: "old_tok",
					feedTokenCreatedAt: new Date("2026-06-01T00:00:00Z"),
					feedBusyOnly: false,
				},
			], // calendar (owner)
		];
		const caller = callerFor("org-1");
		const res = await caller.calendar.rotateCalendarFeed({
			calendarId: CAL_ID,
		});
		expect(typeof res.token).toBe("string");
		expect(res.token).not.toBe("old_tok");
		expect(res.url).toContain(`/calendar/feed/${res.token}`);
		expect(state.updated[0]?.feedToken).toBe(res.token);
	});

	test("forbids a non-owner", async () => {
		state.selectQueue = [
			[{ id: CAL_ID, ownerUserId: OTHER_USER, organizationId: "org-1" }], // calendar
			[], // no share grant → forbidden
		];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.rotateCalendarFeed({ calendarId: CAL_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("calendar.disableCalendarFeed", () => {
	test("owner disable NULLs the token", async () => {
		state.selectQueue = [
			[
				{
					id: CAL_ID,
					ownerUserId: "user-1",
					organizationId: "org-1",
					feedToken: "live_tok",
					feedTokenCreatedAt: new Date("2026-06-01T00:00:00Z"),
					feedBusyOnly: false,
				},
			], // calendar (owner)
		];
		const caller = callerFor("org-1");
		const res = await caller.calendar.disableCalendarFeed({
			calendarId: CAL_ID,
		});
		expect(res.ok).toBe(true);
		expect(state.updated[0]?.feedToken).toBeNull();
	});

	test("404s when the calendar is not in the org", async () => {
		state.selectQueue = [[]];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.disableCalendarFeed({ calendarId: CAL_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
