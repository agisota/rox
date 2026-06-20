import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB + dependency stubs ---------------------------------------------------
// The admin router talks to Drizzle (`@rox/db/client`), the WS-O flag helpers
// (`@rox/db/utils`), and the PostHog server client (`../../lib/analytics`). We
// stub all three so the suite needs no live database or PostHog — mirroring the
// env-free trpc test harness used by `economy.test.ts`. Each test resets the
// recorded calls and the rows the stubs return.

type AnyRow = Record<string, unknown>;

const state: {
	// query.* relational reads
	users: AnyRow[];
	userById: AnyRow | undefined;
	memberships: AnyRow[];
	balanceRow: AnyRow | undefined;
	flagRows: Record<string, boolean | null>;
	// .select().from()… chains, consumed FIFO
	selectQueue: AnyRow[][];
	// recorded writes
	flagUpserts: AnyRow[];
	flagDeletes: AnyRow[];
	// posthog fallback values keyed by flag key
	posthogFlags: Record<string, boolean | string | undefined>;
} = {
	users: [],
	userById: undefined,
	memberships: [],
	balanceRow: undefined,
	flagRows: {},
	selectQueue: [],
	flagUpserts: [],
	flagDeletes: [],
	posthogFlags: {},
};

function selectBuilder(rows: AnyRow[]) {
	const chain = {
		from: () => chain,
		where: () => chain,
		orderBy: () => chain,
		limit: () => Promise.resolve(rows),
	};
	return chain;
}

const fakeDb = {
	select: () => selectBuilder(state.selectQueue.shift() ?? []),
	query: {
		users: {
			findMany: () => Promise.resolve(state.users),
			findFirst: () => Promise.resolve(state.userById),
		},
		members: {
			findMany: () => Promise.resolve(state.memberships),
		},
		roxBalances: {
			findFirst: () => Promise.resolve(state.balanceRow),
		},
	},
};

mock.module("@rox/db/client", () => ({ db: fakeDb }));

// WS-O flag helpers. `resolveUserFlag` returns the queued override (or null =
// inherit); `upsertUserFlagOverride` records the call.
mock.module("@rox/db/utils", () => ({
	resolveUserFlag: ({ key }: { userId: string; key: string }) =>
		Promise.resolve(key in state.flagRows ? state.flagRows[key] : null),
	upsertUserFlagOverride: (args: AnyRow) => {
		if (args.value === null) state.flagDeletes.push(args);
		else state.flagUpserts.push(args);
		return Promise.resolve();
	},
}));

// PostHog server client used for the flag fallback.
mock.module("../../lib/analytics", () => ({
	posthog: {
		getFeatureFlag: (key: string) => Promise.resolve(state.posthogFlags[key]),
	},
	analytics: { capture: () => {}, identify: () => {} },
}));

const { adminRouter } = await import("./admin");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ admin: adminRouter });
const createCaller = createCallerFactory(appRouter);

function callerFor(email: string) {
	return createCaller({
		session: {
			user: { id: "admin-1", email },
			session: { activeOrganizationId: null },
		},
		headers: new Headers(),
		// biome-ignore lint/suspicious/noExplicitAny: minimal test ctx
	} as any);
}

beforeEach(() => {
	state.users = [];
	state.userById = undefined;
	state.memberships = [];
	state.balanceRow = undefined;
	state.flagRows = {};
	state.selectQueue = [];
	state.flagUpserts = [];
	state.flagDeletes = [];
	state.posthogFlags = {};
});

describe("admin gate", () => {
	test("rejects a non-@rox.one caller with FORBIDDEN", async () => {
		const caller = callerFor("someone@gmail.com");
		await expect(caller.admin.listUsers({})).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});
});

describe("admin.listUsers (T1 — paginate + search)", () => {
	function seedUsers(n: number) {
		const base = new Date("2026-01-10T00:00:00.000Z").getTime();
		state.selectQueue.push(
			Array.from({ length: n }, (_, i) => ({
				id: `u${i}`,
				name: `User ${i}`,
				email: `user${i}@example.com`,
				image: null,
				createdAt: new Date(base - i * 1000),
			})),
		);
	}

	test("respects the limit and exposes a nextCursor when there are more", async () => {
		seedUsers(3);
		const caller = callerFor("admin@rox.one");
		const res = await caller.admin.listUsers({ limit: 2 });
		expect(res.users).toHaveLength(2);
		expect(res.nextCursor).toBeDefined();
	});

	test("no nextCursor when the page is not full", async () => {
		seedUsers(1);
		const caller = callerFor("admin@rox.one");
		const res = await caller.admin.listUsers({ limit: 50 });
		expect(res.users).toHaveLength(1);
		expect(res.nextCursor).toBeUndefined();
	});

	test("accepts an optional search query without throwing", async () => {
		seedUsers(1);
		const caller = callerFor("admin@rox.one");
		const res = await caller.admin.listUsers({ q: "user0" });
		expect(res.users).toHaveLength(1);
	});

	test("defaults work with no input", async () => {
		seedUsers(0);
		const caller = callerFor("admin@rox.one");
		const res = await caller.admin.listUsers();
		expect(res.users).toHaveLength(0);
		expect(res.nextCursor).toBeUndefined();
	});
});

describe("admin.getUser (T2)", () => {
	test("throws NOT_FOUND for an unknown id", async () => {
		state.userById = undefined;
		const caller = callerFor("admin@rox.one");
		await expect(
			caller.admin.getUser({ userId: "11111111-1111-4111-8111-111111111111" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("returns the user with its organizations", async () => {
		state.userById = {
			id: "11111111-1111-4111-8111-111111111111",
			name: "Jane",
			email: "jane@example.com",
			image: null,
			createdAt: new Date(),
		};
		state.memberships = [
			{
				role: "owner",
				organization: { id: "org-1", name: "Acme", slug: "acme" },
			},
		];
		const caller = callerFor("admin@rox.one");
		const res = await caller.admin.getUser({
			userId: "11111111-1111-4111-8111-111111111111",
		});
		expect(res.user.email).toBe("jane@example.com");
		expect(res.organizations).toHaveLength(1);
		expect(res.organizations[0]?.role).toBe("owner");
	});
});

describe("admin.getUserBalance (T3 — READ-ONLY)", () => {
	test("returns the default 500 + empty ledger when no balance row exists", async () => {
		state.balanceRow = undefined;
		state.selectQueue.push([]); // ledger select
		const caller = callerFor("admin@rox.one");
		const res = await caller.admin.getUserBalance({
			userId: "11111111-1111-4111-8111-111111111111",
		});
		expect(res.balanceRox).toBe("500");
		expect(res.ledger).toHaveLength(0);
	});

	test("returns the persisted balance + ledger rows desc", async () => {
		state.balanceRow = { balanceRox: "1200", updatedAt: new Date() };
		state.selectQueue.push([
			{
				id: "l0",
				deltaRox: "250",
				kind: "adjustment",
				usageRequestId: null,
				topupId: null,
				createdAt: new Date(),
			},
		]);
		const caller = callerFor("admin@rox.one");
		const res = await caller.admin.getUserBalance({
			userId: "11111111-1111-4111-8111-111111111111",
		});
		expect(res.balanceRox).toBe("1200");
		expect(res.ledger).toHaveLength(1);
	});
});

describe("admin.getUserUsage + getUserSessions (T4)", () => {
	test("getUserUsage returns the requests rows", async () => {
		state.selectQueue.push([
			{
				id: "r0",
				modelId: "m",
				tokensIn: 1,
				tokensOut: 2,
				usdCost: "0.01",
				roxCost: "1",
				createdAt: new Date(),
			},
		]);
		const caller = callerFor("admin@rox.one");
		const res = await caller.admin.getUserUsage({
			userId: "11111111-1111-4111-8111-111111111111",
		});
		expect(res.requests).toHaveLength(1);
	});

	test("getUserSessions returns the session rows", async () => {
		state.selectQueue.push([
			{
				id: "s0",
				expiresAt: new Date(Date.now() + 1000),
				createdAt: new Date(),
				ipAddress: "1.2.3.4",
				userAgent: "ua",
			},
		]);
		const caller = callerFor("admin@rox.one");
		const res = await caller.admin.getUserSessions({
			userId: "11111111-1111-4111-8111-111111111111",
		});
		expect(res.sessions).toHaveLength(1);
	});
});

describe("admin.getUserFlags + setUserFlag (T5)", () => {
	test("effective follows the override when present, ignoring PostHog", async () => {
		state.flagRows = { "web-agents-ui-access": true };
		state.posthogFlags = { "web-agents-ui-access": false };
		const caller = callerFor("admin@rox.one");
		const res = await caller.admin.getUserFlags({
			userId: "11111111-1111-4111-8111-111111111111",
		});
		const flag = res.flags.find((f) => f.key === "web-agents-ui-access");
		expect(flag?.override).toBe(true);
		expect(flag?.effective).toBe(true);
	});

	test("effective falls back to PostHog when there is no override", async () => {
		state.flagRows = {}; // inherit
		state.posthogFlags = { "cloud-access": true };
		const caller = callerFor("admin@rox.one");
		const res = await caller.admin.getUserFlags({
			userId: "11111111-1111-4111-8111-111111111111",
		});
		const flag = res.flags.find((f) => f.key === "cloud-access");
		expect(flag?.override).toBeNull();
		expect(flag?.effective).toBe(true);
	});

	test("excludes the payload flag RELAY_URL_OVERRIDE from the toggle list", async () => {
		const caller = callerFor("admin@rox.one");
		const res = await caller.admin.getUserFlags({
			userId: "11111111-1111-4111-8111-111111111111",
		});
		expect(res.flags.some((f) => f.key === "relay-url-override")).toBe(false);
	});

	test("setUserFlag force-on upserts the override", async () => {
		const caller = callerFor("admin@rox.one");
		await caller.admin.setUserFlag({
			userId: "11111111-1111-4111-8111-111111111111",
			key: "cloud-access",
			value: true,
		});
		expect(state.flagUpserts).toHaveLength(1);
		expect(state.flagUpserts[0]?.value).toBe(true);
		expect(state.flagUpserts[0]?.updatedBy).toBe("admin-1");
	});

	test("setUserFlag null clears the override (inherit)", async () => {
		const caller = callerFor("admin@rox.one");
		await caller.admin.setUserFlag({
			userId: "11111111-1111-4111-8111-111111111111",
			key: "cloud-access",
			value: null,
		});
		expect(state.flagDeletes).toHaveLength(1);
	});

	test("setUserFlag rejects an unknown key", async () => {
		const caller = callerFor("admin@rox.one");
		await expect(
			caller.admin.setUserFlag({
				userId: "11111111-1111-4111-8111-111111111111",
				key: "not-a-real-flag",
				value: true,
			}),
		).rejects.toThrow();
	});

	test("setUserFlag rejects toggling a payload flag", async () => {
		const caller = callerFor("admin@rox.one");
		await expect(
			caller.admin.setUserFlag({
				userId: "11111111-1111-4111-8111-111111111111",
				key: "relay-url-override",
				value: true,
			}),
		).rejects.toThrow();
	});
});
