import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// Stubs `@rox/db/client` so the suite needs no live database. A queue of
// result-sets drives each `select`; inserts/updates record their values. The
// `transaction` runs its callback against the same fake (the provisionJid
// drizzle adapter uses select/insert/update on the tx).

type AnyRow = Record<string, unknown>;

const state: {
	selectQueue: AnyRow[][];
	inserted: { values: AnyRow[] }[];
	insertReturning: AnyRow[];
	updated: AnyRow[];
} = {
	selectQueue: [],
	inserted: [],
	insertReturning: [{ id: "acct-new" }],
	updated: [],
};

function selectBuilder(rows: AnyRow[]) {
	const step = (): Promise<AnyRow[]> & Record<string, () => unknown> => {
		const p = Promise.resolve(rows) as Promise<AnyRow[]> &
			Record<string, () => unknown>;
		p.from = step;
		p.where = step;
		p.innerJoin = step;
		p.leftJoin = step;
		p.orderBy = step;
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
			return { where: () => Promise.resolve([]) };
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

const { xmppRouter } = await import("./xmpp");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ xmpp: xmppRouter });
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

beforeEach(() => {
	process.env.XMPP_FEDERATION_ENABLED = "1";
	state.selectQueue = [];
	state.inserted = [];
	state.insertReturning = [{ id: "acct-new" }];
	state.updated = [];
});

afterEach(() => {
	process.env.XMPP_FEDERATION_ENABLED = undefined;
});

describe("xmpp gating", () => {
	test("provisionJid throws when federation is disabled", async () => {
		process.env.XMPP_FEDERATION_ENABLED = "0";
		const caller = callerFor("org-1");
		await expect(caller.xmpp.provisionJid()).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
	});

	test("status throws when federation is disabled", async () => {
		process.env.XMPP_FEDERATION_ENABLED = undefined;
		const caller = callerFor("org-1");
		await expect(caller.xmpp.status()).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
	});
});

describe("xmpp.provisionJid", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(caller.xmpp.provisionJid()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("fails when the caller has no handle", async () => {
		state.selectQueue = [[{ handle: null }]]; // profile lookup
		const caller = callerFor("org-1");
		await expect(caller.xmpp.provisionJid()).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
	});

	test("provisions a fresh JID from the caller handle", async () => {
		state.selectQueue = [
			[{ handle: "alice" }], // profile lookup
			[], // findAccountByUser -> none
			[], // findOwnerOfLocalpart (account) -> none
			[], // findOwnerOfLocalpart (alias join) -> none
		];
		const caller = callerFor("org-1");
		const res = await caller.xmpp.provisionJid();
		expect(res.outcome).toBe("created");
		expect(res.jid).toBe("alice@xmpp.rox.one");
		// An xmpp_accounts row was inserted.
		expect(state.inserted.length).toBeGreaterThanOrEqual(1);
	});
});

describe("xmpp.status", () => {
	test("reports not provisioned when no account exists", async () => {
		state.selectQueue = [[]]; // account lookup -> none
		const caller = callerFor("org-1");
		const res = await caller.xmpp.status();
		expect(res.provisioned).toBe(false);
		expect(res.jid).toBeNull();
	});

	test("reports the bound JID + status", async () => {
		state.selectQueue = [
			[{ jidLocalpart: "alice", domain: "xmpp.rox.one", status: "active" }],
		];
		const caller = callerFor("org-1");
		const res = await caller.xmpp.status();
		expect(res.provisioned).toBe(true);
		expect(res.jid).toBe("alice@xmpp.rox.one");
		expect(res.status).toBe("active");
	});
});

describe("xmpp.listBindings", () => {
	test("returns null account + [] aliases when unprovisioned", async () => {
		state.selectQueue = [[]]; // account lookup -> none
		const caller = callerFor("org-1");
		const res = await caller.xmpp.listBindings();
		expect(res.account).toBeNull();
		expect(res.aliases).toEqual([]);
	});

	test("returns the account + its reserved aliases", async () => {
		state.selectQueue = [
			[{ id: "acct-1", jidLocalpart: "alicia" }], // account
			[{ id: "alias-1", jidLocalpart: "alice" }], // aliases
		];
		const caller = callerFor("org-1");
		const res = await caller.xmpp.listBindings();
		expect(res.account?.id).toBe("acct-1");
		expect(res.aliases).toHaveLength(1);
		expect(res.aliases[0]?.jidLocalpart).toBe("alice");
	});
});
