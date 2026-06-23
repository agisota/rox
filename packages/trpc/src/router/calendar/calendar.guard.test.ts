import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TRPCError } from "@trpc/server";

// --- Cross-org attendee/share guard (C1/S3) ---------------------------------
// A sibling of calendar.test.ts with its own harness. We DON'T mock the
// assertOrgMembers module (bun's mock.module is process-global and would bleed
// into assertOrgMembers.test.ts). Instead the fakeDb's `members` select returns
// [] so the REAL guard throws FORBIDDEN for any non-empty userId set; an
// email-kind attendee flat-maps to [] userIds → the guard returns early (no
// select) and stays exempt. `verifyOrgMembership` throws only for the OUTSIDER
// (the caller `user-1` always resolves, since the active-org middleware itself
// calls verifyOrgMembership for the caller). So createEvent/addAttendee/
// shareCalendar reject a non-member userId, while an email-kind attendee passes.

type AnyRow = Record<string, unknown>;

const state: {
	selectQueue: AnyRow[][];
	inserted: { values: AnyRow[] }[];
	insertReturning: AnyRow[];
} = {
	selectQueue: [],
	inserted: [],
	insertReturning: [{ id: "new-id" }],
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

const fakeDb = {
	select: () => nextSelect(),
	insert: () => insertChain(),
	update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
	delete: () => ({ where: () => Promise.resolve() }),
	transaction: <T>(fn: (tx: typeof fakeDb) => Promise<T>) => fn(fakeDb),
};

mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
mock.module("../integration/utils", () => ({
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
	// Keep the full export surface so this mock is harmless if it bleeds into a
	// sibling suite that imports the other guards.
	verifyOrgAdmin: () => Promise.resolve({ membership: {} }),
	verifyOrgOwner: () => Promise.resolve({ membership: {} }),
	// Resolves for the caller (the active-org middleware checks `user-1`); throws
	// only when the share target is the OUTSIDER (uuid literal below).
	verifyOrgMembership: (userId: string) => {
		if (userId === "99999999-9999-4999-8999-999999999999") {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Not a member of this organization",
			});
		}
		return Promise.resolve({ membership: {} });
	},
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
const OUTSIDER = "99999999-9999-4999-8999-999999999999";

beforeEach(() => {
	state.selectQueue = [];
	state.inserted = [];
	state.insertReturning = [{ id: "new-id" }];
});

describe("calendar cross-org guards (C1/S3)", () => {
	test("createEvent rejects a non-member userId attendee", async () => {
		state.selectQueue = [
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar (owner)
		];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.createEvent({
				calendarId: CAL_ID,
				title: "Sync",
				dtstart: new Date("2026-06-20T09:00:00Z"),
				dtend: new Date("2026-06-20T10:00:00Z"),
				attendees: [{ kind: "userId", userId: OUTSIDER }],
			}),
		).rejects.toThrow(/member/i);
		// Guard fires before the transaction → no event written.
		expect(state.inserted).toHaveLength(0);
	});

	test("createEvent allows an email-kind attendee (exempt from membership)", async () => {
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
	});

	test("addAttendee rejects a non-member userId", async () => {
		state.selectQueue = [
			[{ id: EVENT_ID, calendarId: CAL_ID, organizationId: "org-1" }], // event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
		];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.addAttendee({
				eventId: EVENT_ID,
				attendee: { kind: "userId", userId: OUTSIDER },
			}),
		).rejects.toThrow(/member/i);
		expect(state.inserted).toHaveLength(0);
	});

	test("addAttendee allows an email-kind attendee (exempt from membership)", async () => {
		state.selectQueue = [
			[{ id: EVENT_ID, calendarId: CAL_ID, organizationId: "org-1" }], // event
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar access
		];
		state.insertReturning = [{ id: "attendee-1" }];
		const caller = callerFor("org-1");
		const res = await caller.calendar.addAttendee({
			eventId: EVENT_ID,
			attendee: { kind: "email", email: "guest@example.com" },
		});
		expect(res).toBeDefined();
		expect(state.inserted).toHaveLength(1);
	});

	test("shareCalendar rejects a non-member target user", async () => {
		state.selectQueue = [
			[{ id: CAL_ID, ownerUserId: "user-1", organizationId: "org-1" }], // calendar (owner)
		];
		const caller = callerFor("org-1");
		await expect(
			caller.calendar.shareCalendar({
				calendarId: CAL_ID,
				userId: OUTSIDER,
				role: "reader",
			}),
		).rejects.toThrow(/member/i);
		expect(state.inserted).toHaveLength(0);
	});
});
