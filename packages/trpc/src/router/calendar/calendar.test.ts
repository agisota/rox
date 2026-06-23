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

function nextSelect() {
	return selectBuilder(state.selectQueue.shift() ?? []);
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
	// Pass-through guard: cross-org rejection is covered in calendar.guard.test.ts.
	assertOrgMembers: () => Promise.resolve(),
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
		];
		const caller = callerFor("org-1");
		const res = await caller.calendar.listOccurrences({
			rangeStart: new Date("2026-06-01T00:00:00Z"),
			rangeEnd: new Date("2026-06-04T00:00:00Z"),
		});
		expect(res.occurrences).toHaveLength(3);
		expect(res.occurrences[0]?.start).toBe("2026-06-01T09:00:00.000Z");
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
