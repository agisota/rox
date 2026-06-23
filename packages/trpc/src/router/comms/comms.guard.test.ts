import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- Cross-org recipient guard (T1/S4) --------------------------------------
// A sibling of comms.test.ts with its own harness. We DON'T mock the
// assertOrgMembers module (bun's mock.module is process-global and would bleed
// into assertOrgMembers.test.ts). Instead the fakeDb's `members` select returns
// [] so the REAL guard finds no member and throws FORBIDDEN — letting us assert
// sendMessage rejects a non-member recipient without writing any message.

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
	verifyOrgMembership: () => Promise.resolve({ membership: {} }),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
	// Keep the full export surface so this mock is harmless if it bleeds into a
	// sibling suite that imports the other guards.
	verifyOrgAdmin: () => Promise.resolve({ membership: {} }),
	verifyOrgOwner: () => Promise.resolve({ membership: {} }),
}));
mock.module("../../lib/graph", () => ({
	graphService: {
		resolveIdentity: () =>
			Promise.resolve({ contact: { id: "contact-1" }, created: true }),
	},
}));

const { commsRouter } = await import("./comms");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ comms: commsRouter });
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

const OTHER_USER = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
	state.selectQueue = [];
	state.inserted = [];
	state.insertReturning = [{ id: "new-id" }];
});

describe("comms.sendMessage cross-org guard (T1/S4)", () => {
	test("rejects a cross-org userId recipient and writes no message", async () => {
		const caller = callerFor("org-1");
		await expect(
			caller.comms.sendMessage({
				recipients: [{ kind: "userId", userId: OTHER_USER }],
				body: "hi",
			}),
		).rejects.toThrow(/member/i);
		// The guard fires before any message/thread/delivery insert.
		expect(state.inserted).toHaveLength(0);
	});
});
