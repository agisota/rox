import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Drive DB-quota-engine tests (W2-DRIVE T2). Stubs `@rox/db/client` so the
 * atomic accounting + overage ledger logic is exercised without a live DB.
 */

type AnyRow = Record<string, unknown>;

// Read a drizzle pgTable's name off its `Symbol(drizzle:Name)` symbol so the
// stub can route inserts/updates by table without relying on String(table).
function tableName(table: unknown): string {
	if (!table || typeof table !== "object") return "";
	const sym = Object.getOwnPropertySymbols(table).find(
		(s) => s.description === "drizzle:Name",
	);
	return sym ? String((table as Record<symbol, unknown>)[sym]) : "";
}

const state: {
	quotaRow: AnyRow | undefined;
	conditionalUpdateRows: AnyRow[];
	updated: AnyRow[];
	ledgerInserted: AnyRow[];
	balanceUpdated: AnyRow[];
	transactionRan: number;
	selectQueue: AnyRow[][];
} = {
	quotaRow: undefined,
	conditionalUpdateRows: [{ bytesUsed: 1 }],
	updated: [],
	ledgerInserted: [],
	balanceUpdated: [],
	transactionRan: 0,
	selectQueue: [],
};

function nextSelect(): AnyRow[] {
	return state.selectQueue.shift() ?? [];
}

// Chainable select builder resolving to the next queued rows. Supports
// `.from().where().limit()` and `selectDistinct(...).from().where()`.
function selectBuilder() {
	const rows = nextSelect();
	const step = (): Promise<AnyRow[]> & Record<string, () => unknown> => {
		const p = Promise.resolve(rows) as Promise<AnyRow[]> &
			Record<string, () => unknown>;
		p.from = step;
		p.where = step;
		p.orderBy = step;
		p.limit = step;
		return p;
	};
	return step();
}

function makeDb() {
	const dbObj: AnyRow = {
		select: () => selectBuilder(),
		selectDistinct: () => selectBuilder(),
		insert: (table: unknown) => ({
			values: (vals: AnyRow) => {
				if (tableName(table).includes("ledger"))
					state.ledgerInserted.push(vals);
				return {
					onConflictDoNothing: () => Promise.resolve(),
					onConflictDoUpdate: () => Promise.resolve(),
					returning: () => Promise.resolve([{ id: "x" }]),
				};
			},
		}),
		update: (table: unknown) => ({
			set: (vals: AnyRow) => {
				if (tableName(table).includes("balance"))
					state.balanceUpdated.push(vals);
				else state.updated.push(vals);
				const whereResult = Promise.resolve(
					state.conditionalUpdateRows,
				) as Promise<AnyRow[]> & { returning?: () => Promise<AnyRow[]> };
				whereResult.returning = () =>
					Promise.resolve(state.conditionalUpdateRows);
				return { where: () => whereResult };
			},
		}),
		query: {
			storageQuota: { findFirst: () => Promise.resolve(state.quotaRow) },
			roxBalances: { findFirst: () => Promise.resolve(undefined) },
		},
		transaction: async (fn: (tx: AnyRow) => Promise<unknown>) => {
			state.transactionRan += 1;
			return fn(dbObj);
		},
	};
	return dbObj;
}

const fakeDb = makeDb();
mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));

const {
	ensureQuota,
	commitUpload,
	releaseBytes,
	accrueDailyOverage,
	setOverageOptIn,
	reconcileUserQuota,
} = await import("./quota");

const CAP = 10_737_418_240;
const GB = 1_000_000_000;

beforeEach(() => {
	state.quotaRow = { bytesUsed: 0, quotaBytes: CAP, overageOptIn: false };
	state.conditionalUpdateRows = [{ bytesUsed: 1 }];
	state.updated = [];
	state.ledgerInserted = [];
	state.balanceUpdated = [];
	state.transactionRan = 0;
	state.selectQueue = [];
});

describe("ensureQuota", () => {
	test("returns the seeded snapshot", async () => {
		const q = await ensureQuota("u1");
		expect(q.quotaBytes).toBe(CAP);
		expect(q.bytesUsed).toBe(0);
	});
});

describe("commitUpload", () => {
	test("commits within quota via the conditional UPDATE", async () => {
		state.conditionalUpdateRows = [{ bytesUsed: 100 }];
		const r = await commitUpload("u1", 100);
		expect(r.committed).toBe(true);
		expect(r.reason).toBe("within_quota");
	});

	test("reports loss when the conditional UPDATE matched 0 rows", async () => {
		state.quotaRow = {
			bytesUsed: CAP - 50,
			quotaBytes: CAP,
			overageOptIn: false,
		};
		state.conditionalUpdateRows = [];
		const r = await commitUpload("u1", 100);
		expect(r.committed).toBe(false);
		expect(r.allowed).toBe(false);
	});

	test("blocks an over-quota commit (no opt-in) without touching the DB", async () => {
		state.quotaRow = { bytesUsed: CAP, quotaBytes: CAP, overageOptIn: false };
		const r = await commitUpload("u1", 1_000);
		expect(r.committed).toBe(false);
		expect(r.reason).toBe("over_quota_blocked");
		expect(state.updated).toHaveLength(0);
	});

	test("soft-meter: over-quota with opt-in commits unconditionally + reports overage", async () => {
		state.quotaRow = {
			bytesUsed: CAP - 200,
			quotaBytes: CAP,
			overageOptIn: true,
		};
		const r = await commitUpload("u1", 1_000);
		expect(r.committed).toBe(true);
		expect(r.reason).toBe("overage_accrued");
		expect(r.overageBytes).toBe(800);
		expect(state.updated).toHaveLength(1);
	});
});

describe("releaseBytes", () => {
	test("decrements by the file size", async () => {
		state.quotaRow = { bytesUsed: 500, quotaBytes: CAP, overageOptIn: false };
		await releaseBytes("u1", 200);
		expect(state.updated).toHaveLength(1);
	});

	test("no-op when nothing to release", async () => {
		state.quotaRow = { bytesUsed: 0, quotaBytes: CAP, overageOptIn: false };
		await releaseBytes("u1", 200);
		expect(state.updated).toHaveLength(0);
	});
});

describe("accrueDailyOverage", () => {
	test("no ledger row when within quota", async () => {
		state.quotaRow = { bytesUsed: CAP, quotaBytes: CAP, overageOptIn: true };
		const r = await accrueDailyOverage("u1");
		expect(r.ledgerWritten).toBe(false);
		expect(state.ledgerInserted).toHaveLength(0);
	});

	test("writes a drive_overage ledger debit when over quota", async () => {
		state.quotaRow = {
			bytesUsed: CAP + 30 * GB,
			quotaBytes: CAP,
			overageOptIn: true,
		};
		state.selectQueue = [[]]; // hasAccruedToday → none
		const r = await accrueDailyOverage("u1", 30, 30);
		expect(r.ledgerWritten).toBe(true);
		expect(r.roxDebited).toBeGreaterThan(0);
		expect(state.transactionRan).toBe(1);
		expect(state.ledgerInserted).toHaveLength(1);
		expect(state.ledgerInserted[0]?.kind).toBe("drive_overage");
		// debit = negative delta
		expect(String(state.ledgerInserted[0]?.deltaRox).startsWith("-")).toBe(
			true,
		);
		expect(state.balanceUpdated).toHaveLength(1);
	});

	test("is idempotent per day — a second run does not double-bill (D2)", async () => {
		state.quotaRow = {
			bytesUsed: CAP + 30 * GB,
			quotaBytes: CAP,
			overageOptIn: true,
		};
		state.selectQueue = [[{ id: "todays-row" }]]; // hasAccruedToday → exists
		const r = await accrueDailyOverage("u1", 30, 30);
		expect(r.alreadyAccrued).toBe(true);
		expect(r.ledgerWritten).toBe(false);
		expect(state.ledgerInserted).toHaveLength(0);
		expect(state.balanceUpdated).toHaveLength(0);
	});
});

describe("setOverageOptIn (D1)", () => {
	test("upserts the flag and returns the snapshot", async () => {
		state.quotaRow = { bytesUsed: 0, quotaBytes: CAP, overageOptIn: true };
		const r = await setOverageOptIn("u1", true);
		expect(r.overageOptIn).toBe(true);
	});
});

describe("reconcileUserQuota (D6)", () => {
	test("recomputes bytes_used from distinct clean sizes and corrects drift", async () => {
		state.quotaRow = { bytesUsed: 999, quotaBytes: CAP, overageOptIn: false };
		// selectDistinct → two distinct clean files of 100 + 50
		state.selectQueue = [
			[
				{ sha256: "a", sizeBytes: 100 },
				{ sha256: "b", sizeBytes: 50 },
			],
		];
		const r = await reconcileUserQuota("u1");
		expect(r.before).toBe(999);
		expect(r.after).toBe(150);
		expect(r.drift).toBe(150 - 999);
		// drift present → wrote the corrected total
		expect(state.updated).toHaveLength(1);
		expect(state.updated[0]?.bytesUsed).toBe(150);
	});

	test("no write when already aligned (idempotent)", async () => {
		state.quotaRow = { bytesUsed: 150, quotaBytes: CAP, overageOptIn: false };
		state.selectQueue = [
			[
				{ sha256: "a", sizeBytes: 100 },
				{ sha256: "b", sizeBytes: 50 },
			],
		];
		const r = await reconcileUserQuota("u1");
		expect(r.after).toBe(150);
		expect(r.drift).toBe(0);
		expect(state.updated).toHaveLength(0);
	});
});
