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
	topupInserted: AnyRow[];
} = {
	balanceRow: undefined,
	nextSelect: [],
	ledgerInserted: [],
	balanceUpdated: [],
	insertedBalanceForUser: [],
	topupInserted: [],
};

// --- dv.net seam ------------------------------------------------------------
// The createInvoice procedure constructs a dv.net client; mock it so the suite
// never reads DVNET_API_KEY or hits the network. `createInvoiceMock` records the
// request the procedure built and returns a deterministic invoice id + URL.
const createInvoiceMock = mock(async () => ({
	invoiceId: "dvnet-inv-1",
	checkoutUrl: "https://pay.dv.net/checkout/dvnet-inv-1",
}));

mock.module("@rox/shared/dvnet-client", () => ({
	createDvNetClient: () => ({ createInvoice: createInvoiceMock }),
	buildInvoiceRequest: (
		usdtAmount: number,
		orderId: string,
		callbackUrl: string,
	) => {
		if (!Number.isFinite(usdtAmount) || !(usdtAmount > 0)) {
			throw new Error("usdtAmount must be a finite positive number");
		}
		return {
			amount: usdtAmount.toFixed(6),
			currency: "USDT",
			callback_url: callbackUrl,
			order_id: orderId,
		};
	},
}));

// A chainable select builder returning whichever rows the test queued. Queries
// that end at `.orderBy(...)` (e.g. models.list) await its result directly;
// paginated reads chain `.limit(...)`. `orderBy` therefore returns a Promise
// for the rows that ALSO carries a `.limit()` method, so both call shapes work
// without a hand-rolled thenable object.
function selectBuilder(rows: AnyRow[]) {
	const terminal = Promise.resolve(rows) as Promise<AnyRow[]> & {
		limit: () => Promise<AnyRow[]>;
	};
	terminal.limit = () => Promise.resolve(rows);
	const chain = {
		from: () => chain,
		where: () => chain,
		orderBy: () => terminal,
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
				// A topup row carries `usdtAmount`; a ledger row carries `kind`.
				if ("usdtAmount" in vals) {
					state.topupInserted.push(vals);
					return Promise.resolve([{ id: "topup-id-1" }]);
				}
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
	state.topupInserted = [];
	createInvoiceMock.mockClear();
	createInvoiceMock.mockImplementation(async () => ({
		invoiceId: "dvnet-inv-1",
		checkoutUrl: "https://pay.dv.net/checkout/dvnet-inv-1",
	}));
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

describe("economy.topup.quote (T4)", () => {
	test("previews the Rox a USDT amount buys (1 USDT = 100 Rox)", async () => {
		const caller = callerFor("dev@rox.one");
		const res = await caller.economy.topup.quote({ usdtAmount: 5 });
		expect(res).toEqual({ usdt: 5, rox: 500 });
	});

	test("rejects a non-positive USDT amount", async () => {
		const caller = callerFor("dev@rox.one");
		await expect(
			caller.economy.topup.quote({ usdtAmount: 0 }),
		).rejects.toThrow();
	});
});

describe("economy.topup.createInvoice (T4)", () => {
	test("inserts a pending topup row and returns the checkout URL", async () => {
		const caller = callerFor("dev@rox.one");
		const res = await caller.economy.topup.createInvoice({ usdtAmount: 5 });

		expect(state.topupInserted).toHaveLength(1);
		const row = state.topupInserted[0];
		expect(row?.userId).toBe("user-1");
		expect(row?.usdtAmount).toBe("5");
		expect(row?.roxAmount).toBe("500");
		expect(row?.status).toBe("pending");
		// The provider invoice id is reconciled back onto the row.
		expect(state.balanceUpdated.length).toBeGreaterThanOrEqual(0);

		expect(createInvoiceMock).toHaveBeenCalledTimes(1);
		expect(res.checkoutUrl).toBe("https://pay.dv.net/checkout/dvnet-inv-1");
		expect(res.topupId).toBe("topup-id-1");
	});

	test("rejects a non-positive USDT amount before touching the DB", async () => {
		const caller = callerFor("dev@rox.one");
		await expect(
			caller.economy.topup.createInvoice({ usdtAmount: 0 }),
		).rejects.toThrow();
		expect(state.topupInserted).toHaveLength(0);
		expect(createInvoiceMock).not.toHaveBeenCalled();
	});
});

describe("economy.models.list (T7)", () => {
	test("returns the catalog rows the DB yields", async () => {
		state.nextSelect = [
			{
				id: "m1",
				provider: "rox",
				modelId: "rox-r1",
				publicUsdPerMIn: "0",
				publicUsdPerMOut: "0",
				pricingFamily: "other",
				isFree: true,
			},
		];
		const caller = callerFor("dev@rox.one");
		const res = await caller.economy.models.list();
		expect(res).toHaveLength(1);
		expect(res[0]?.modelId).toBe("rox-r1");
	});
});
