import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// Stubs `@rox/db/client` so the suite needs no live database (mirrors the
// env-free trpc test harness in economy.test.ts).

type AnyRow = Record<string, unknown>;

const state: {
	selectRows: AnyRow[];
	inserted: AnyRow[];
	insertReturning: AnyRow[];
	updated: AnyRow[];
	deleteCalls: number;
} = {
	selectRows: [],
	inserted: [],
	insertReturning: [{ id: "new-id" }],
	updated: [],
	deleteCalls: 0,
};

// A Drizzle-like query builder. Each step returns a Promise of the rows with
// the chain methods attached, so a query can be awaited at any terminal step
// (`.limit()`, `.orderBy()`, or `.where()`) without a thenable plain object.
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

const fakeDb = {
	select: () => selectBuilder(state.selectRows),
	insert: () => ({
		values: (vals: AnyRow) => {
			state.inserted.push(vals);
			return { returning: () => Promise.resolve(state.insertReturning) };
		},
	}),
	update: () => ({
		set: (vals: AnyRow) => {
			state.updated.push(vals);
			return {
				where: () => ({
					returning: () => Promise.resolve(state.insertReturning),
				}),
			};
		},
	}),
	delete: () => ({
		where: () => {
			state.deleteCalls += 1;
			return Promise.resolve();
		},
	}),
};

mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
mock.module("../integration/utils", () => ({
	verifyOrgMembership: () => Promise.resolve(),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
}));

const { dashboardRouter } = await import("./dashboard");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ dashboard: dashboardRouter });
const createCaller = createCallerFactory(appRouter);

function callerFor(activeOrganizationId: string | null) {
	return createCaller({
		session: {
			user: { id: "user-1", email: "dev@rox.one" },
			session: { activeOrganizationId },
		},
		headers: new Headers(),
		// biome-ignore lint/suspicious/noExplicitAny: minimal test ctx
	} as any);
}

// Fixed valid UUIDs for inputs (stub returns queued rows regardless of value).
const BOARD_ID = "11111111-1111-4111-8111-111111111111";
const SECTION_ID = "22222222-2222-4222-8222-222222222222";
const ENTRY_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
	state.selectRows = [];
	state.inserted = [];
	state.insertReturning = [{ id: "new-id" }];
	state.updated = [];
	state.deleteCalls = 0;
	fakeDb.select = () => selectBuilder(state.selectRows);
});

describe("dashboard.list", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(caller.dashboard.list()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("returns the org's dashboards", async () => {
		state.selectRows = [{ id: "board-1", name: "Ops" }];
		const caller = callerFor("org-1");
		const res = await caller.dashboard.list();
		expect(res).toHaveLength(1);
		expect(res[0]?.id).toBe("board-1");
	});
});

describe("dashboard.get", () => {
	test("404s when the board is not in the org", async () => {
		state.selectRows = [];
		const caller = callerFor("org-1");
		await expect(
			caller.dashboard.get({ dashboardId: BOARD_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("returns the board with sections and entries", async () => {
		const calls: AnyRow[][] = [
			[{ id: "board-1", name: "Ops", organizationId: "org-1" }],
			[{ id: "sec-1", kind: "note" }],
			[{ id: "entry-1", sectionId: "sec-1" }],
		];
		let i = 0;
		fakeDb.select = () => selectBuilder(calls[i++] ?? []);
		const caller = callerFor("org-1");
		const res = await caller.dashboard.get({ dashboardId: BOARD_ID });
		expect(res.dashboard.id).toBe("board-1");
		expect(res.sections).toHaveLength(1);
		expect(res.entries).toHaveLength(1);
	});
});

describe("dashboard.create", () => {
	test("inserts an org-scoped board with creator id", async () => {
		state.insertReturning = [{ id: "board-new" }];
		const caller = callerFor("org-1");
		const res = await caller.dashboard.create({ name: "Ops", slug: "ops" });
		expect(res?.id).toBe("board-new");
		expect(state.inserted[0]?.organizationId).toBe("org-1");
		expect(state.inserted[0]?.createdByUserId).toBe("user-1");
	});

	test("rejects a non-kebab slug", async () => {
		const caller = callerFor("org-1");
		await expect(
			caller.dashboard.create({ name: "Bad", slug: "Bad Slug" }),
		).rejects.toThrow();
	});
});

describe("dashboard.createSection", () => {
	test("denormalizes organization_id onto the section", async () => {
		fakeDb.select = () =>
			selectBuilder([{ id: "board-1", organizationId: "org-1" }]);
		state.insertReturning = [{ id: "sec-new" }];
		const caller = callerFor("org-1");
		const res = await caller.dashboard.createSection({
			dashboardId: BOARD_ID,
			kind: "priority",
		});
		expect(res?.id).toBe("sec-new");
		expect(state.inserted[0]?.organizationId).toBe("org-1");
		// FK is resolved from the verified parent dashboard row, not the raw input.
		expect(state.inserted[0]?.dashboardId).toBe("board-1");
		expect(state.inserted[0]?.kind).toBe("priority");
	});

	test("rejects an unknown section kind", async () => {
		const caller = callerFor("org-1");
		await expect(
			caller.dashboard.createSection({
				dashboardId: BOARD_ID,
				// biome-ignore lint/suspicious/noExplicitAny: deliberate bad input
				kind: "not-a-kind" as any,
			}),
		).rejects.toThrow();
	});
});

describe("dashboard.createEntry", () => {
	test("denormalizes board + org ids from the parent section", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{ id: "sec-1", dashboardId: "board-1", organizationId: "org-1" },
			]);
		state.insertReturning = [{ id: "entry-new" }];
		const caller = callerFor("org-1");
		const res = await caller.dashboard.createEntry({
			sectionId: SECTION_ID,
			body: { text: "hi" },
		});
		expect(res?.id).toBe("entry-new");
		expect(state.inserted[0]?.organizationId).toBe("org-1");
		expect(state.inserted[0]?.dashboardId).toBe("board-1");
		// FK is resolved from the verified parent section row, not the raw input.
		expect(state.inserted[0]?.sectionId).toBe("sec-1");
		expect(state.inserted[0]?.createdByUserId).toBe("user-1");
	});

	test("404s when the section is not in the org", async () => {
		state.selectRows = [];
		const caller = callerFor("org-1");
		await expect(
			caller.dashboard.createEntry({ sectionId: SECTION_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("dashboard.deleteEntry", () => {
	test("deletes after confirming org ownership", async () => {
		fakeDb.select = () =>
			selectBuilder([{ id: "entry-1", organizationId: "org-1" }]);
		const caller = callerFor("org-1");
		const res = await caller.dashboard.deleteEntry({ entryId: ENTRY_ID });
		expect(res.ok).toBe(true);
		expect(state.deleteCalls).toBe(1);
	});
});

describe("dashboard.delete", () => {
	test("deletes the board after confirming org ownership", async () => {
		fakeDb.select = () =>
			selectBuilder([{ id: "board-1", organizationId: "org-1" }]);
		const caller = callerFor("org-1");
		const res = await caller.dashboard.delete({ dashboardId: BOARD_ID });
		expect(res.ok).toBe(true);
		expect(state.deleteCalls).toBe(1);
	});
});
