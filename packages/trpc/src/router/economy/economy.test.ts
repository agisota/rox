import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// The router talks to Drizzle; we stub `@rox/db/client` so the suite needs no
// live database (mirrors the env-free trpc test harness). Each test resets the
// recorded calls and the rows the stub returns.

type AnyRow = Record<string, unknown>;

const state: {
	balanceRow: AnyRow | undefined;
	nextSelect: AnyRow[];
	ledgerInserted: AnyRow[];
	balanceUpdated: AnyRow[];
	insertedBalanceForUser: string[];
} = {
	balanceRow: undefined,
	nextSelect: [],
	ledgerInserted: [],
	balanceUpdated: [],
	insertedBalanceForUser: [],
};

// A chainable select builder returning whichever rows the test queued.
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
	insert: () => ({
		values: (vals: AnyRow) => ({
			onConflictDoNothing: () => {
				if (typeof vals.userId === "string") {
					state.insertedBalanceForUser.push(vals.userId);
				}
				return Promise.resolve();
			},
			returning: () => {
				state.ledgerInserted.push(vals);
				return Promise.resolve([{ id: "ledger-id-1" }]);
			},
		}),
	}),
	update: () => ({
		set: (vals: AnyRow) => ({
			where: () => {
				state.balanceUpdated.push(vals);
				return Promise.resolve();
			},
		}),
	}),
	select: () => {
		// The router only ever runs one select per query, so return the queued set.
		return selectBuilder(state.nextSelect);
	},
	query: {
		roxBalances: {
			findFirst: () => Promise.resolve(state.balanceRow),
		},
	},
	transaction: async (fn: (tx: typeof fakeDb) => Promise<unknown>) =>
		fn(fakeDb),
};

mock.module("@rox/db/client", () => ({ db: fakeDb }));

const { economyRouter } = await import("./economy");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ economy: economyRouter });
const createCaller = createCallerFactory(appRouter);

function callerFor(email: string) {
	return createCaller({
		session: {
			user: { id: "user-1", email },
			session: { activeOrganizationId: null },
		},
		headers: new Headers(),
		// biome-ignore lint/suspicious/noExplicitAny: minimal test ctx
	} as any);
}

beforeEach(() => {
	state.balanceRow = undefined;
	state.nextSelect = [];
	state.ledgerInserted = [];
	state.balanceUpdated = [];
	state.insertedBalanceForUser = [];
});

describe("economy.balance (T3)", () => {
	test("seeds the starting balance on first read (no existing row)", async () => {
		const caller = callerFor("dev@rox.one");
		const result = await caller.economy.balance();

		// ensureBalance attempts an insert-on-conflict for the user.
		expect(state.insertedBalanceForUser).toContain("user-1");
		expect(result.balanceRox).toBe("500");
	});

	test("returns the persisted balance when a row exists", async () => {
		state.balanceRow = { balanceRox: "742", updatedAt: new Date() };
		const caller = callerFor("dev@rox.one");
		const result = await caller.economy.balance();
		expect(result.balanceRox).toBe("742");
	});
});

describe("economy.ledger (T3)", () => {
	test("respects the limit and exposes a nextCursor when there are more", async () => {
		const base = new Date("2026-01-01T00:00:00.000Z").getTime();
		state.nextSelect = Array.from({ length: 3 }, (_, i) => ({
			id: `l${i}`,
			deltaRox: "1",
			kind: "topup",
			usageRequestId: null,
			topupId: null,
			createdAt: new Date(base - i * 1000),
		}));
		const caller = callerFor("dev@rox.one");
		const res = await caller.economy.ledger({ limit: 2 });

		expect(res.items).toHaveLength(2);
		expect(res.nextCursor).toBeDefined();
	});

	test("no nextCursor when the page is not full", async () => {
		state.nextSelect = [
			{
				id: "l0",
				deltaRox: "1",
				kind: "topup",
				usageRequestId: null,
				topupId: null,
				createdAt: new Date(),
			},
		];
		const caller = callerFor("dev@rox.one");
		const res = await caller.economy.ledger({ limit: 50 });
		expect(res.items).toHaveLength(1);
		expect(res.nextCursor).toBeUndefined();
	});
});

describe("economy.admin.grant (T6)", () => {
	test("rejects a non-@rox.one user with FORBIDDEN", async () => {
		const caller = callerFor("someone@gmail.com");
		await expect(
			caller.economy.admin.grant({ userId: "user-2", rox: 100 }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("credits the balance and appends a ledger entry (kind adjustment)", async () => {
		state.balanceRow = { balanceRox: "500", updatedAt: new Date() };
		const caller = callerFor("admin@rox.one");
		const res = await caller.economy.admin.grant({
			userId: "user-2",
			rox: 250,
			note: "welcome bonus",
		});

		expect(res.balanceAfter).toBe(750);
		expect(res.ledgerEntryId).toBe("ledger-id-1");
		expect(state.balanceUpdated[0]?.balanceRox).toBe("750");
		expect(state.ledgerInserted[0]?.kind).toBe("adjustment");
		expect(state.ledgerInserted[0]?.deltaRox).toBe("250");
	});

	test("rejects a non-positive grant amount", async () => {
		const caller = callerFor("admin@rox.one");
		await expect(
			caller.economy.admin.grant({ userId: "user-2", rox: 0 }),
		).rejects.toThrow();
		await expect(
			caller.economy.admin.grant({ userId: "user-2", rox: -5 }),
		).rejects.toThrow();
	});
});
