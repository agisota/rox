import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// The router talks to Drizzle; we stub `@rox/db/client` so the suite needs no
// live database (mirrors the env-free trpc test harness in economy.test.ts).

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
			return {
				onConflictDoNothing: () => ({
					returning: () => Promise.resolve(state.insertReturning),
				}),
				returning: () => Promise.resolve(state.insertReturning),
			};
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

// Membership check is exercised separately; here we let it resolve so router
// logic can be asserted without a live members table.
mock.module("../integration/utils", () => ({
	verifyOrgMembership: () => Promise.resolve(),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
}));

const { skillLibraryRouter } = await import("./skill-library");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ skillLibrary: skillLibraryRouter });
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

// A fixed valid UUID for `libraryId` inputs (the stub returns queued rows
// regardless of value; the input only has to satisfy the Zod uuid() guard).
const LIB_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
	state.selectRows = [];
	state.inserted = [];
	state.insertReturning = [{ id: "new-id" }];
	state.updated = [];
	state.deleteCalls = 0;
});

describe("skillLibrary.list", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(caller.skillLibrary.list()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("returns the org's libraries", async () => {
		state.selectRows = [{ id: "lib-1", name: "Core" }];
		const caller = callerFor("org-1");
		const res = await caller.skillLibrary.list();
		expect(res).toHaveLength(1);
		expect(res[0]?.id).toBe("lib-1");
	});
});

describe("skillLibrary.get", () => {
	test("404s when the library is not in the org", async () => {
		state.selectRows = [];
		const caller = callerFor("org-1");
		await expect(
			caller.skillLibrary.get({ libraryId: crypto.randomUUID() }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("returns the library with its items and team assignments", async () => {
		// first select = library row, then items, then assignments
		const calls: AnyRow[][] = [
			[{ id: "lib-1", name: "Core", organizationId: "org-1" }],
			[{ id: "item-1", skillId: "skill-1" }],
			[{ id: "assign-1", teamId: "team-1" }],
		];
		let i = 0;
		fakeDb.select = () => selectBuilder(calls[i++] ?? []);
		const caller = callerFor("org-1");
		const res = await caller.skillLibrary.get({ libraryId: LIB_ID });
		expect(res.library.id).toBe("lib-1");
		expect(res.items).toHaveLength(1);
		expect(res.teamAssignments).toHaveLength(1);
		// restore default select for subsequent tests
		fakeDb.select = () => selectBuilder(state.selectRows);
	});
});

describe("skillLibrary.create", () => {
	test("inserts an org-scoped library and returns the row", async () => {
		state.insertReturning = [{ id: "lib-new", slug: "core", name: "Core" }];
		const caller = callerFor("org-1");
		const res = await caller.skillLibrary.create({
			name: "Core",
			slug: "core",
		});
		expect(res?.id).toBe("lib-new");
		expect(state.inserted[0]?.organizationId).toBe("org-1");
		expect(state.inserted[0]?.createdByUserId).toBe("user-1");
		expect(state.inserted[0]?.slug).toBe("core");
	});

	test("rejects a non-kebab slug", async () => {
		const caller = callerFor("org-1");
		await expect(
			caller.skillLibrary.create({ name: "Bad", slug: "Bad Slug" }),
		).rejects.toThrow();
	});
});

describe("skillLibrary.addItem", () => {
	test("verifies the library belongs to the org before inserting", async () => {
		state.selectRows = [];
		const caller = callerFor("org-1");
		await expect(
			caller.skillLibrary.addItem({
				libraryId: crypto.randomUUID(),
				skillId: crypto.randomUUID(),
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("denormalizes organization_id onto the membership row", async () => {
		const skillId = crypto.randomUUID();
		const calls: AnyRow[][] = [
			[{ id: "lib-1", organizationId: "org-1" }], // library lookup
			[{ id: skillId, organizationId: "org-1" }], // skill lookup
		];
		let i = 0;
		fakeDb.select = () => selectBuilder(calls[i++] ?? []);
		state.insertReturning = [{ id: "item-1" }];
		const caller = callerFor("org-1");
		const res = await caller.skillLibrary.addItem({
			libraryId: LIB_ID,
			skillId,
		});
		expect(res?.id).toBe("item-1");
		expect(state.inserted[0]?.organizationId).toBe("org-1");
		expect(state.inserted[0]?.libraryId).toBe(LIB_ID);
		fakeDb.select = () => selectBuilder(state.selectRows);
	});
});

describe("skillLibrary.assignTeam", () => {
	test("denormalizes organization_id onto the assignment row", async () => {
		fakeDb.select = () =>
			selectBuilder([{ id: "lib-1", organizationId: "org-1" }]);
		state.insertReturning = [{ id: "assign-1" }];
		const caller = callerFor("org-1");
		const res = await caller.skillLibrary.assignTeam({
			libraryId: LIB_ID,
			teamId: crypto.randomUUID(),
		});
		expect(res?.id).toBe("assign-1");
		expect(state.inserted[0]?.organizationId).toBe("org-1");
		fakeDb.select = () => selectBuilder(state.selectRows);
	});
});

describe("skillLibrary.delete", () => {
	test("deletes the library after confirming org ownership", async () => {
		fakeDb.select = () =>
			selectBuilder([{ id: "lib-1", organizationId: "org-1" }]);
		const caller = callerFor("org-1");
		const res = await caller.skillLibrary.delete({ libraryId: LIB_ID });
		expect(res.ok).toBe(true);
		expect(state.deleteCalls).toBe(1);
		fakeDb.select = () => selectBuilder(state.selectRows);
	});
});
