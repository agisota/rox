import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// `economy.service.ts` is the production, Drizzle-backed persistence port behind
// the pure `settleRequestWith` core (covered separately in settle-core.test.ts).
// The pure core is DB-free; what is UNtested is this file's real transaction
// wiring: the read-or-seed `ensureBalance`, and the in-`db.transaction` writers
// that translate the plan into `usage_requests` / `rox_ledger` / `rox_balances`
// rows with the exact drizzle `.returning()` call shapes.
//
// We stub `@rox/db/client` so the suite needs no live DB, mirroring the tx-stub
// model in `apps/api/.../economy/dvnet/webhook/route.test.ts`: `state` chooses
// what the in-tx balance read resolves and records what each writer persisted.
// This file provides complete, self-contained `@rox/db/*` stubs, so it never
// depends on a sibling suite's mocks. We deliberately do NOT call
// `mock.restore()`: the sibling `economy.test.ts` also installs (un-restored)
// `@rox/db/*` module mocks, and restoring mid-run would un-mock the schema while
// an already imported module still references it. Per-test recorder resets in
// `beforeEach` are the leak guard.

type AnyRow = Record<string, unknown>;

const state: {
	// What the in-transaction balance read resolves to. `undefined` models a
	// brand-new user whose row was just seeded (so the read still misses and the
	// service falls back to STARTING_BALANCE_ROX).
	balanceRow: AnyRow | undefined;
	balanceSeededFor: string[];
	usageInserted: AnyRow[];
	ledgerInserted: AnyRow[];
	balanceUpdated: AnyRow[];
	// Records the order writes happened in, to assert interleaving:
	// usage row must exist before the ledger row that back-references it.
	writeOrder: string[];
} = {
	balanceRow: undefined,
	balanceSeededFor: [],
	usageInserted: [],
	ledgerInserted: [],
	balanceUpdated: [],
	writeOrder: [],
};

// One stub object serves as both `db` and the in-transaction handle: the service
// calls `db.insert(...).values(...).onConflictDoNothing(...)` to seed, then reads
// `db.query.roxBalances.findFirst`, and inside `db.transaction` uses the same
// surface for the three writers. `.returning()` hands back a generated id so the
// service can back-fill `usageRequestId` into the ledger row.
const fakeDb = {
	insert: (table: { __name?: string }) => ({
		values: (vals: AnyRow) => {
			const builder = {
				onConflictDoNothing: () => {
					if (typeof vals.userId === "string")
						state.balanceSeededFor.push(vals.userId);
					return Promise.resolve();
				},
				returning: () => {
					if (table.__name === "usage_requests") {
						state.usageInserted.push(vals);
						state.writeOrder.push("usage");
						return Promise.resolve([{ id: "usage-1" }]);
					}
					// rox_ledger
					state.ledgerInserted.push(vals);
					state.writeOrder.push("ledger");
					return Promise.resolve([{ id: "ledger-1" }]);
				},
			};
			return builder;
		},
	}),
	update: () => ({
		set: (vals: AnyRow) => ({
			where: () => {
				state.balanceUpdated.push(vals);
				state.writeOrder.push("balance");
				return Promise.resolve();
			},
		}),
	}),
	query: {
		roxBalances: {
			findFirst: () => Promise.resolve(state.balanceRow),
		},
	},
	transaction: async (fn: (tx: typeof fakeDb) => Promise<unknown>) =>
		fn(fakeDb),
};

mock.module("@rox/db/client", () => ({ db: fakeDb }));

// Tables only appear inside drizzle `eq(...)` / insert-target expressions; tag
// each so the stub can route inserts to the right recorder.
mock.module("@rox/db/schema", () => ({
	roxBalances: {
		__name: "rox_balances",
		userId: "userId",
		balanceRox: "balanceRox",
	},
	roxLedger: { __name: "rox_ledger", id: "id" },
	usageRequests: { __name: "usage_requests", id: "id" },
}));

const { ensureBalance, settleRequest, STARTING_BALANCE_ROX } = await import(
	"./economy.service"
);

const baseArgs = {
	userId: "user-1",
	organizationId: null,
	chatSessionId: null,
	modelId: "rox-r1",
	usage: { inputTokens: 1000, outputTokens: 1000 },
};

describe("economy.service", () => {
	beforeEach(() => {
		state.balanceRow = undefined;
		state.balanceSeededFor = [];
		state.usageInserted = [];
		state.ledgerInserted = [];
		state.balanceUpdated = [];
		state.writeOrder = [];
	});

	describe("ensureBalance", () => {
		test("seeds the row then returns the persisted balance for an existing user", async () => {
			state.balanceRow = { balanceRox: "1234" };
			const balance = await ensureBalance("user-1");

			// Read-or-seed: an insert-on-conflict-do-nothing always runs first.
			expect(state.balanceSeededFor).toEqual(["user-1"]);
			expect(balance).toBe(1234);
		});

		test("falls back to STARTING_BALANCE_ROX when the row read still misses", async () => {
			state.balanceRow = undefined;
			const balance = await ensureBalance("fresh-user");

			expect(state.balanceSeededFor).toEqual(["fresh-user"]);
			expect(balance).toBe(STARTING_BALANCE_ROX);
		});

		test("coerces the numeric-column string balance to a number", async () => {
			state.balanceRow = { balanceRox: "0" };
			const balance = await ensureBalance("user-1");
			expect(balance).toBe(0);
			expect(typeof balance).toBe("number");
		});
	});

	describe("settleRequest", () => {
		test("a free request inserts only the usage row — no ledger, no balance debit", async () => {
			// The service's loadPricing currently treats every model as free (T7
			// pending), so any request records usage and never debits.
			state.balanceRow = { balanceRox: "500" };
			const result = await settleRequest(baseArgs);

			expect(state.usageInserted).toHaveLength(1);
			expect(state.usageInserted[0]?.userId).toBe("user-1");
			expect(state.usageInserted[0]?.modelId).toBe("rox-r1");
			expect(state.ledgerInserted).toHaveLength(0);
			expect(state.balanceUpdated).toHaveLength(0);

			expect(result.charged).toBe(false);
			expect(result.roxCost).toBe(0);
			expect(result.balanceRox).toBe(500);
		});

		test("writes usage before ledger so the ledger can back-reference the usage id", async () => {
			// Guards the interleaving contract even though the current free-pricing
			// path emits no ledger row: usage is always first in the write order.
			state.balanceRow = { balanceRox: "500" };
			await settleRequest(baseArgs);

			expect(state.writeOrder[0]).toBe("usage");
		});

		test("seeds the balance inside the transaction before reading it", async () => {
			// ensureBalance runs through the SAME tx handle: a brand-new user is
			// seeded and the missing read falls back to the starting balance.
			state.balanceRow = undefined;
			const result = await settleRequest({ ...baseArgs, userId: "new-user" });

			expect(state.balanceSeededFor).toContain("new-user");
			expect(result.balanceRox).toBe(STARTING_BALANCE_ROX);
		});

		test("persists a non-finite token count as 0 rather than NaN", async () => {
			state.balanceRow = { balanceRox: "500" };
			await settleRequest({
				...baseArgs,
				usage: { inputTokens: Number.NaN, outputTokens: 1000 },
			});

			expect(state.usageInserted).toHaveLength(1);
			expect(state.usageInserted[0]?.tokensIn).toBe(0);
			expect(state.usageInserted[0]?.tokensOut).toBe(1000);
		});

		test("settles two requests for the same user independently (no cross-contamination)", async () => {
			// Interleaved-operations consistency: each settle opens its own tx and
			// records its own usage row; one request's state must not bleed into the
			// next once beforeEach has reset the recorders.
			state.balanceRow = { balanceRox: "500" };
			await settleRequest(baseArgs);
			await settleRequest({ ...baseArgs, modelId: "rox-r2" });

			expect(state.usageInserted).toHaveLength(2);
			expect(state.usageInserted[0]?.modelId).toBe("rox-r1");
			expect(state.usageInserted[1]?.modelId).toBe("rox-r2");
		});
	});
});
