import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// Stubs `@rox/db/client` so the suite needs no live database (mirrors the
// env-free harness in mcp-admin.test.ts).

type AnyRow = Record<string, unknown>;

const state: {
	nextSelect: AnyRow[];
	selectQueue: AnyRow[][];
} = {
	nextSelect: [],
	selectQueue: [],
};

function selectBuilder(rows: AnyRow[]) {
	const step = (): Promise<AnyRow[]> &
		Record<string, (arg?: unknown) => unknown> => {
		const p = Promise.resolve(rows) as Promise<AnyRow[]> &
			Record<string, (arg?: unknown) => unknown>;
		p.from = step;
		p.innerJoin = step;
		p.leftJoin = step;
		p.where = step;
		p.orderBy = step;
		p.limit = step;
		return p;
	};
	return step();
}

const fakeDb = {
	select: () => {
		const rows = state.selectQueue.length
			? (state.selectQueue.shift() as AnyRow[])
			: state.nextSelect;
		return selectBuilder(rows);
	},
};

mock.module("@rox/db/client", () => ({ db: fakeDb }));
mock.module("../integration/utils", () => ({
	verifyOrgMembership: () => Promise.resolve(),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
}));

const { profileCapabilitiesRouter } = await import("./profile-capabilities");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({
	profileCapabilities: profileCapabilitiesRouter,
});
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

const PERSONA = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
	state.nextSelect = [];
	state.selectQueue = [];
});

describe("profileCapabilities.mcpInventory", () => {
	test("lists servers/tools with coverage and never leaks secrets", async () => {
		// getPersonaInOrg select → persona row; then grants select → [].
		state.selectQueue = [[{ id: PERSONA, organizationId: "org-1" }], []];
		const caller = callerFor("org-1");
		const res = await caller.profileCapabilities.mcpInventory({
			personaId: PERSONA,
		});

		expect(res.servers.length).toBeGreaterThan(0);
		expect(res.tools.length).toBeGreaterThan(0);
		expect(res.coverage.total).toBe(res.servers.length);
		// No persona grant → built-in server not enabled for this persona.
		expect(res.coverage.enabled).toBe(0);

		// Structural redaction: no secret-shaped key on any payload object.
		const blob = JSON.stringify(res).toLowerCase();
		for (const needle of ["token", "secret", "password", "apikey"]) {
			expect(blob.includes(needle)).toBe(false);
		}
	});

	test("search filters the tool list", async () => {
		const caller = callerFor("org-1");
		const all = await caller.profileCapabilities.mcpInventory({});
		const filtered = await caller.profileCapabilities.mcpInventory({
			search: "task",
		});
		expect(filtered.tools.length).toBeLessThan(all.tools.length);
		expect(
			filtered.tools.every((t) => /task/i.test(`${t.name}${t.description}`)),
		).toBe(true);
	});

	test("without a persona lens the built-in server counts as enabled", async () => {
		const caller = callerFor("org-1");
		const res = await caller.profileCapabilities.mcpInventory({});
		expect(res.coverage.enabled).toBe(res.coverage.total);
	});

	test("rejects when no active org", async () => {
		const caller = callerFor(null);
		await expect(caller.profileCapabilities.mcpInventory({})).rejects.toThrow();
	});
});

describe("profileCapabilities.skillCoverage", () => {
	test("returns enabled/total over assignment rows", async () => {
		state.selectQueue = [
			[{ id: PERSONA, organizationId: "org-1" }], // getPersonaInOrg
			[{ enabled: true }, { enabled: false }, { enabled: true }], // coverage
		];
		const caller = callerFor("org-1");
		const res = await caller.profileCapabilities.skillCoverage({
			personaId: PERSONA,
		});
		expect(res.total).toBe(3);
		expect(res.enabled).toBe(2);
	});

	test("404s when the persona is not in the active org", async () => {
		state.selectQueue = [[]]; // getPersonaInOrg → no row
		const caller = callerFor("org-1");
		await expect(
			caller.profileCapabilities.skillCoverage({ personaId: PERSONA }),
		).rejects.toThrow();
	});
});
