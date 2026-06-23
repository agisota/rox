import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// The route reconciles a dv.net webhook against a pending `rox_topups` row and,
// on a confirmed payment, credits the balance in one transaction. We stub
// `@rox/db/client` so the suite needs no live DB. Tests mutate `state` to choose
// which topup row the lookup resolves and to inspect what got written.

type AnyRow = Record<string, unknown>;

const state: {
	topupRow: AnyRow | undefined;
	// Set once a delivery wins the in-tx conditional claim. Distinct from the
	// pre-transaction read (`topupRow`) so a second delivery can pass the
	// non-transactional pre-check yet still lose the atomic claim — modelling the
	// real double-delivery race.
	topupClaimed: boolean;
	balanceRow: AnyRow | undefined;
	topupUpdated: AnyRow[];
	balanceUpdated: AnyRow[];
	ledgerInserted: AnyRow[];
	balanceSeededFor: string[];
} = {
	topupRow: undefined,
	topupClaimed: false,
	balanceRow: undefined,
	topupUpdated: [],
	balanceUpdated: [],
	ledgerInserted: [],
	balanceSeededFor: [],
};

const fakeTx = {
	update: (table: { __name?: string }) => ({
		set: (vals: AnyRow) => {
			// The conditional topup claim flips a still-`pending` row to `confirmed`
			// and records it; a racing delivery (row already `confirmed`) affects 0
			// rows. Balance updates are unconditional. `apply()` returns the affected
			// rows so the route's `.returning()` can detect a lost race (empty array).
			const apply = (): AnyRow[] => {
				if (table.__name === "rox_topups") {
					// Atomic claim of a pending row: first caller wins, later racing
					// callers see 0 affected rows.
					if (state.topupRow?.status !== "pending" || state.topupClaimed)
						return [];
					state.topupClaimed = true;
					state.topupUpdated.push(vals);
					return [{ id: state.topupRow.id ?? "topup-1" }];
				}
				state.balanceUpdated.push(vals);
				return [];
			};
			// `.where()` resolves to a Promise (for the unconditional balance update,
			// which is awaited directly) that ALSO exposes `.returning()` for the
			// conditional topup claim, which reads the affected rows.
			return {
				where: () => {
					const rows = apply();
					const builder = Promise.resolve() as Promise<void> & {
						returning: () => Promise<AnyRow[]>;
					};
					builder.returning = () => Promise.resolve(rows);
					return builder;
				},
			};
		},
	}),
	insert: () => ({
		values: (vals: AnyRow) => {
			// A balance seed carries only `userId` and is chained with
			// `.onConflictDoNothing()`; a ledger insert carries `kind`/`topupId` and
			// is awaited directly. The returned value is a Promise (records the
			// ledger row when awaited) that ALSO exposes `.onConflictDoNothing()`
			// and `.returning()` for the chained call shapes.
			const builder = Promise.resolve().then(() => {
				if ("kind" in vals) state.ledgerInserted.push(vals);
			}) as Promise<void> & {
				onConflictDoNothing: () => Promise<void>;
				returning: () => Promise<Array<{ id: string }>>;
			};
			builder.onConflictDoNothing = () => {
				if (typeof vals.userId === "string")
					state.balanceSeededFor.push(vals.userId);
				return Promise.resolve();
			};
			builder.returning = () => {
				state.ledgerInserted.push(vals);
				return Promise.resolve([{ id: "ledger-1" }]);
			};
			return builder;
		},
	}),
	query: {
		roxBalances: {
			findFirst: () => Promise.resolve(state.balanceRow),
		},
	},
};

const fakeDb = {
	query: {
		roxTopups: {
			findFirst: () => Promise.resolve(state.topupRow),
		},
	},
	transaction: async (fn: (tx: typeof fakeTx) => Promise<unknown>) =>
		fn(fakeTx),
};

mock.module("@rox/db/client", () => ({ db: fakeDb }));

// Tables only ever appear inside drizzle `eq(...)` expressions; tag rox_topups
// so the tx stub can tell topup-updates from balance-updates.
mock.module("@rox/db/schema", () => ({
	roxTopups: { __name: "rox_topups", id: "id", status: "status" },
	roxBalances: { __name: "rox_balances", userId: "userId" },
	roxLedger: { __name: "rox_ledger" },
}));

// The route is gated behind env.DVNET_ENABLED (dv.net is disabled by default).
// Existing behavior tests run with it enabled; the disabled path is its own test.
const envState: { DVNET_ENABLED: string | undefined } = {
	DVNET_ENABLED: "true",
};
mock.module("@/env", () => ({ env: envState }));

const { POST } = await import("./route");

function buildRequest(body: unknown) {
	return new Request("http://localhost/api/economy/dvnet/webhook", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

const PENDING_TOPUP = {
	id: "topup-1",
	userId: "user-1",
	status: "pending",
	dvnetInvoiceId: "chg_1",
};

function confirmedWebhook(overrides: AnyRow = {}) {
	return {
		id: "chg_1",
		status: "confirmed",
		amount: "5.00",
		currency: "USDT",
		order_id: "topup-1",
		...overrides,
	};
}

describe("dv.net webhook route (T5)", () => {
	beforeEach(() => {
		state.topupRow = { ...PENDING_TOPUP };
		state.topupClaimed = false;
		state.balanceRow = { balanceRox: "0" };
		state.topupUpdated = [];
		state.balanceUpdated = [];
		state.ledgerInserted = [];
		state.balanceSeededFor = [];
		envState.DVNET_ENABLED = "true";
	});

	test("returns 503 and credits nothing when dv.net is disabled", async () => {
		envState.DVNET_ENABLED = undefined;
		const res = await POST(buildRequest(confirmedWebhook()));
		expect(res.status).toBe(503);
		expect(state.topupUpdated).toHaveLength(0);
		expect(state.ledgerInserted).toHaveLength(0);
		expect(state.balanceUpdated).toHaveLength(0);
	});

	test("credits a confirmed payment once: marks topup confirmed + ledger + balance", async () => {
		const res = await POST(buildRequest(confirmedWebhook()));
		expect(res.status).toBe(200);

		expect(state.topupUpdated).toHaveLength(1);
		expect(state.topupUpdated[0]?.status).toBe("confirmed");
		expect(state.topupUpdated[0]?.confirmedAt).toBeInstanceOf(Date);

		expect(state.ledgerInserted).toHaveLength(1);
		expect(state.ledgerInserted[0]?.kind).toBe("topup");
		expect(state.ledgerInserted[0]?.topupId).toBe("topup-1");
		// 5 USDT = 500 Rox.
		expect(state.ledgerInserted[0]?.deltaRox).toBe("500");

		expect(state.balanceUpdated).toHaveLength(1);
		expect(state.balanceUpdated[0]?.balanceRox).toBe("500");
	});

	test("is idempotent: an already-confirmed topup is a no-op 200", async () => {
		state.topupRow = { ...PENDING_TOPUP, status: "confirmed" };
		const res = await POST(buildRequest(confirmedWebhook()));
		expect(res.status).toBe(200);
		expect(state.ledgerInserted).toHaveLength(0);
		expect(state.balanceUpdated).toHaveLength(0);
		expect(state.topupUpdated).toHaveLength(0);
	});

	test("two confirmed deliveries for the same order_id credit exactly once", async () => {
		// Both deliveries pass the pre-transaction `status === "confirmed"` check
		// (the row is still pending when each reads it). The conditional in-tx claim
		// (`status='pending'`) settles the race: the first delivery flips the row and
		// credits; the second finds 0 affected rows and acks without crediting.
		const first = await POST(buildRequest(confirmedWebhook()));
		const second = await POST(buildRequest(confirmedWebhook()));

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);

		// Exactly one settlement: one topup claim, one ledger insert, one credit.
		expect(state.topupUpdated).toHaveLength(1);
		expect(state.ledgerInserted).toHaveLength(1);
		expect(state.balanceUpdated).toHaveLength(1);
		expect(state.balanceUpdated[0]?.balanceRox).toBe("500");
	});

	test("returns 400 on a malformed body", async () => {
		const res = await POST(buildRequest("not json"));
		expect(res.status).toBe(400);
	});

	test("returns 400 when the webhook fails validation (bad currency)", async () => {
		const res = await POST(buildRequest(confirmedWebhook({ currency: "BTC" })));
		expect(res.status).toBe(400);
		expect(state.ledgerInserted).toHaveLength(0);
	});

	test("returns 404 when no topup matches the order_id", async () => {
		state.topupRow = undefined;
		const res = await POST(buildRequest(confirmedWebhook()));
		expect(res.status).toBe(404);
		expect(state.ledgerInserted).toHaveLength(0);
	});

	test("returns 200 without crediting for an unconfirmed (pending) payment", async () => {
		const res = await POST(
			buildRequest(confirmedWebhook({ status: "pending" })),
		);
		expect(res.status).toBe(200);
		expect(state.ledgerInserted).toHaveLength(0);
		expect(state.balanceUpdated).toHaveLength(0);
	});

	test("returns 400 when order_id is missing", async () => {
		const { order_id: _omit, ...body } = confirmedWebhook();
		const res = await POST(buildRequest(body));
		expect(res.status).toBe(400);
	});
});
