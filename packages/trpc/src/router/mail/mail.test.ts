import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// Stubs `@rox/db/client` so the suite needs no live database (mirrors the
// comms/dashboard trpc harness). A queue of result-sets drives each `select`;
// inserts/updates record their values and return configured rows.

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
	updateReturning: [{ id: "msg-1" }],
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
				where: () => {
					const p = Promise.resolve(state.updateReturning) as Promise<
						AnyRow[]
					> & {
						returning: () => Promise<AnyRow[]>;
					};
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
	query: {
		roxBalances: {
			findFirst: () => Promise.resolve(state.balanceRow),
		},
	},
} as typeof fakeDb & { query: { roxBalances: { findFirst: () => unknown } } };

// Mutable balance row the economy `ensureBalance` helper reads.
(state as unknown as { balanceRow: AnyRow | undefined }).balanceRow = {
	balanceRox: "500",
};

mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
mock.module("../integration/utils", () => ({
	verifyOrgMembership: () => Promise.resolve(),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
}));

const { mailRouter, setMailSendFnForTest } = await import("./index");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ mail: mailRouter });
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

beforeEach(() => {
	state.selectQueue = [];
	state.inserted = [];
	state.insertReturning = [{ id: "new-id" }];
	state.updated = [];
	state.updateReturning = [{ id: "msg-1" }];
	(state as unknown as { balanceRow: AnyRow | undefined }).balanceRow = {
		balanceRox: "500",
	};
	setMailSendFnForTest(undefined);
});

describe("mail.provisionAddress", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(caller.mail.provisionAddress({})).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("provisions <handle>@rox.one from an explicit handle", async () => {
		state.selectQueue = [
			[], // global reservation lookup → free
		];
		state.insertReturning = [{ id: "addr-1", address: "mark@rox.one" }];
		const caller = callerFor("org-1");
		const res = await caller.mail.provisionAddress({ handle: "Mark" });
		expect(res?.address).toBe("mark@rox.one");
		expect(state.inserted[0]?.values[0]?.address).toBe("mark@rox.one");
	});

	test("refuses an address already reserved by another user", async () => {
		state.selectQueue = [[{ id: "addr-x", userId: "someone-else" }]];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.provisionAddress({ handle: "taken" }),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});
});

describe("mail.getThread", () => {
	test("404s when the thread is not owned by the caller", async () => {
		state.selectQueue = [[]]; // getOwnedThread → empty
		const caller = callerFor("org-1");
		await expect(
			caller.mail.getThread({ threadId: THREAD_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("returns thread + messages for the owner", async () => {
		state.selectQueue = [
			[{ id: THREAD_ID, organizationId: "org-1", ownerUserId: "user-1" }],
			[{ id: MSG_ID, subject: "hi" }],
		];
		const caller = callerFor("org-1");
		const res = await caller.mail.getThread({ threadId: THREAD_ID });
		expect(res.thread.id).toBe(THREAD_ID);
		expect(res.messages).toHaveLength(1);
	});
});

describe("mail.send", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(
			caller.mail.send({ to: ["a@example.com"], body: "hi" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("blocks when the Rox balance is non-positive", async () => {
		(state as unknown as { balanceRow: AnyRow | undefined }).balanceRow = {
			balanceRox: "0",
		};
		const caller = callerFor("org-1");
		await expect(
			caller.mail.send({ to: ["a@example.com"], body: "hi" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("fails with PRECONDITION_FAILED when the mailbox is not provisioned", async () => {
		setMailSendFnForTest(async () => ({ id: "evt" }));
		state.selectQueue = [
			[], // getPrimaryAddress → none
		];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.send({ to: ["a@example.com"], body: "hi" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	test("fails with PRECONDITION_FAILED when outbound is not configured", async () => {
		setMailSendFnForTest(null); // simulate no MAIL_OUTBOUND_ENABLED / key
		state.selectQueue = [
			[{ id: "addr-1", address: "mark@rox.one" }], // getPrimaryAddress
		];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.send({ to: ["a@example.com"], body: "hi" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	test("happy path: sends From <handle>@rox.one and persists an outbound row", async () => {
		const sent: { from: string; to: string[] }[] = [];
		setMailSendFnForTest(async (payload) => {
			sent.push({ from: payload.from, to: payload.to });
			return { id: "resend-evt-1" };
		});
		state.selectQueue = [
			[{ id: "addr-1", address: "mark@rox.one" }], // getPrimaryAddress
		];
		state.insertReturning = [{ id: "out-msg-1" }];
		const caller = callerFor("org-1");
		const res = await caller.mail.send({
			to: ["alice@example.com"],
			subject: "Hi",
			body: "Hello",
		});
		expect(res.messageId).toBe("out-msg-1");
		expect(res.providerId).toBe("resend-evt-1");
		expect(sent[0]?.from).toBe("mark@rox.one");
		expect(sent[0]?.to).toEqual(["alice@example.com"]);
		// An outbound mail_messages row was inserted.
		expect(state.inserted.length).toBeGreaterThanOrEqual(1);
		const outbound = state.inserted.at(-1)?.values[0];
		expect(outbound?.direction).toBe("outbound");
		expect(outbound?.provider).toBe("resend");
	});
});

describe("mail.markRead", () => {
	test("404s when no owned message matches", async () => {
		state.updateReturning = [];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.markRead({ messageId: MSG_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("marks an owned message read", async () => {
		state.updateReturning = [{ id: MSG_ID }];
		const caller = callerFor("org-1");
		const res = await caller.mail.markRead({ messageId: MSG_ID });
		expect(res.ok).toBe(true);
		expect(state.updated[0]?.isRead).toBe(true);
	});
});
