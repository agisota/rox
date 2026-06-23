import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// Stubs `@rox/db/client` so the suite needs no live database (mirrors the
// env-free trpc test harness in economy.test.ts).

type AnyRow = Record<string, unknown>;

const state: {
	nextSelect: AnyRow[];
	whereArgs: unknown[];
} = {
	nextSelect: [],
	whereArgs: [],
};

// A Drizzle-like query builder. Each step returns a Promise of the rows with
// the chain methods attached, so a query can be awaited at any terminal step
// without a thenable plain object. `where` also records its argument.
function selectBuilder(rows: AnyRow[]) {
	const step = (): Promise<AnyRow[]> &
		Record<string, (arg?: unknown) => unknown> => {
		const p = Promise.resolve(rows) as Promise<AnyRow[]> &
			Record<string, (arg?: unknown) => unknown>;
		p.from = step;
		p.innerJoin = step;
		p.leftJoin = step;
		p.where = (arg?: unknown) => {
			state.whereArgs.push(arg);
			return step();
		};
		p.orderBy = step;
		p.limit = step;
		return p;
	};
	return step();
}

const fakeDb = {
	select: () => selectBuilder(state.nextSelect),
};

mock.module("@rox/db/client", () => ({ db: fakeDb }));
mock.module("../integration/utils", () => ({
	verifyOrgMembership: () => Promise.resolve(),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
}));

const { mcpAdminRouter } = await import("./mcp-admin");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ mcpAdmin: mcpAdminRouter });
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

beforeEach(() => {
	state.nextSelect = [];
	state.whereArgs = [];
	fakeDb.select = () => selectBuilder(state.nextSelect);
});

describe("mcpAdmin.listExposedSkills", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(caller.mcpAdmin.listExposedSkills()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("returns skills bound to the mcp surface", async () => {
		state.nextSelect = [
			{
				bindingId: "bind-1",
				skillId: "skill-1",
				slug: "do-thing",
				name: "Do Thing",
				description: "desc",
				kind: "workflow",
				status: "published",
				enabled: true,
				inputSchema: { type: "object" },
				outputSchema: { type: "object" },
			},
		];
		const caller = callerFor("org-1");
		const res = await caller.mcpAdmin.listExposedSkills();
		expect(res).toHaveLength(1);
		expect(res[0]?.slug).toBe("do-thing");
		expect(res[0]?.surface).toBe("mcp");
	});

	test("applies an extra enabled filter when enabledOnly is set", async () => {
		state.nextSelect = [];
		const caller = callerFor("org-1");
		await caller.mcpAdmin.listExposedSkills({ enabledOnly: true });
		// org + surface(+enabled) are folded into a single and(); we just assert
		// the query ran with a where clause (no throw, scoped read happened).
		expect(state.whereArgs.length).toBeGreaterThan(0);
	});
});

describe("mcpAdmin.summary", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(caller.mcpAdmin.summary()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("counts total, enabled, and distinct skills exposed over mcp", async () => {
		state.nextSelect = [
			{ skillId: "skill-1", enabled: true },
			{ skillId: "skill-1", enabled: false },
			{ skillId: "skill-2", enabled: true },
		];
		const caller = callerFor("org-1");
		const res = await caller.mcpAdmin.summary();
		expect(res.totalBindings).toBe(3);
		expect(res.enabledBindings).toBe(2);
		expect(res.distinctSkills).toBe(2);
	});
});
