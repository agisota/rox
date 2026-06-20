import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// Stubs `@rox/db/client` so the suite needs no live database (mirrors the
// env-free trpc harness in dashboard.test.ts). A queue of result-sets drives
// each `select`; inserts/updates record their values and return configured rows.

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
	updateReturning: [{ id: "participant-1" }],
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

function updateChain() {
	return {
		set(vals: AnyRow) {
			state.updated.push(vals);
			return {
				// `where()` is awaitable (no .returning() callers) AND exposes
				// .returning() for callers that want the rows back.
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
	verifyOrgMembership: () => Promise.resolve(),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
}));
// Contact resolver bridge — the router never hits the real graph-service.
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

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const MSG_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
	state.selectQueue = [];
	state.inserted = [];
	state.insertReturning = [{ id: "new-id" }];
	state.updated = [];
	state.updateReturning = [{ id: "participant-1" }];
});

describe("comms.listThreads", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(caller.comms.listThreads()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("returns [] when the caller participates in no threads", async () => {
		state.selectQueue = [[]]; // participant lookup → empty
		const caller = callerFor("org-1");
		const res = await caller.comms.listThreads();
		expect(res).toEqual([]);
	});

	test("returns the caller's threads newest-first", async () => {
		state.selectQueue = [
			[{ threadId: "t-1" }], // participant lookup
			[{ id: "t-1", subject: "Hi" }], // thread fetch
		];
		const caller = callerFor("org-1");
		const res = await caller.comms.listThreads();
		expect(res).toHaveLength(1);
		expect(res[0]?.id).toBe("t-1");
	});
});

describe("comms.getThread", () => {
	test("404s when the thread is not in the org", async () => {
		state.selectQueue = [[]]; // getThreadForOrg → empty
		const caller = callerFor("org-1");
		await expect(
			caller.comms.getThread({ threadId: THREAD_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("forbids a non-participant", async () => {
		state.selectQueue = [
			[{ id: THREAD_ID, organizationId: "org-1" }], // thread
			[{ id: "p-1", userId: OTHER_USER }], // participants (not caller)
		];
		const caller = callerFor("org-1");
		await expect(
			caller.comms.getThread({ threadId: THREAD_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("returns thread + participants + messages for a participant", async () => {
		state.selectQueue = [
			[{ id: THREAD_ID, organizationId: "org-1" }], // thread
			[{ id: "p-1", userId: "user-1" }], // participants (caller in)
			[{ id: MSG_ID, body: "hello" }], // messages
		];
		const caller = callerFor("org-1");
		const res = await caller.comms.getThread({ threadId: THREAD_ID });
		expect(res.thread.id).toBe(THREAD_ID);
		expect(res.participants).toHaveLength(1);
		expect(res.messages).toHaveLength(1);
	});
});

describe("comms.sendMessage", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(
			caller.comms.sendMessage({
				recipients: [{ kind: "userId", userId: OTHER_USER }],
				body: "hi",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("rejects an empty recipients list", async () => {
		const caller = callerFor("org-1");
		await expect(
			caller.comms.sendMessage({ recipients: [], body: "hi" }),
		).rejects.toThrow();
	});

	test("routes a new in-app message: persists message + delivery", async () => {
		// No threadId → resolveThread creates one. Router select calls (in order):
		//   1. resolveCounterpart.addresses.findByValue? (userId ref → skipped)
		//   2. selectTransport.presence.get → []
		//   3. resolveThread.findByDedupKey → []
		// Then inserts: thread, participants, message, delivery; update touchLastMessageAt.
		state.selectQueue = [
			[], // presence.get (recipient offline) → email? no; userId path: presence empty
			[], // findByDedupKey
		];
		state.insertReturning = [{ id: "row-new" }];
		const caller = callerFor("org-1");
		const res = await caller.comms.sendMessage({
			recipients: [{ kind: "userId", userId: OTHER_USER }],
			body: "hello there",
			clientId: "client-abc",
		});
		expect(res.messageId).toBeDefined();
		expect(res.threadId).toBeDefined();
		expect(res.deliveries).toHaveLength(1);
		// A message row and a delivery row were inserted.
		const insertedKinds = state.inserted.length;
		expect(insertedKinds).toBeGreaterThanOrEqual(2);
	});
});

describe("comms.markRead", () => {
	test("404s when the thread is not in the org", async () => {
		state.selectQueue = [[]]; // getThreadForOrg → empty
		const caller = callerFor("org-1");
		await expect(
			caller.comms.markRead({ threadId: THREAD_ID, lastReadMessageId: MSG_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("sets the watermark for a participant", async () => {
		state.selectQueue = [[{ id: THREAD_ID, organizationId: "org-1" }]];
		state.updateReturning = [{ id: "participant-1" }];
		const caller = callerFor("org-1");
		const res = await caller.comms.markRead({
			threadId: THREAD_ID,
			lastReadMessageId: MSG_ID,
		});
		expect(res.ok).toBe(true);
		expect(state.updated[0]?.lastReadMessageId).toBe(MSG_ID);
	});

	test("forbids a non-participant (no participant row updated)", async () => {
		state.selectQueue = [[{ id: THREAD_ID, organizationId: "org-1" }]];
		state.updateReturning = []; // update matched no participant row
		const caller = callerFor("org-1");
		await expect(
			caller.comms.markRead({ threadId: THREAD_ID, lastReadMessageId: MSG_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
