import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Drive confirmUpload quarantine-release test (correctness FIX 2).
 *
 * `commitUpload` adds the bytes to `storage_quota.bytes_used` BEFORE the scan
 * runs. On a `quarantined` verdict the file is never downloadable/shareable, so
 * those just-committed bytes must be released immediately rather than consuming
 * quota until the nightly reconcile. This drives the REAL `confirmUpload` (and
 * the REAL `releaseBytes`) via the same env-free db-stub harness as
 * `drive.test.ts`, using the production `setScanObjectForTest` seam to force a
 * `quarantined` verdict (NOT a process-global `mock.module`, which would leak
 * into sibling test files) so the release branch is exercised.
 */

type AnyRow = Record<string, unknown>;

function tableName(table: unknown): string {
	if (!table || typeof table !== "object") return "";
	const sym = Object.getOwnPropertySymbols(table).find(
		(s) => s.description === "drizzle:Name",
	);
	return sym ? String((table as Record<symbol, unknown>)[sym]) : "";
}

const state: {
	selectQueue: AnyRow[][];
	insertReturning: AnyRow[];
	updateReturning: AnyRow[];
	conditionalUpdateRows: AnyRow[];
	updated: { table: string; set: AnyRow }[];
	quotaRow: AnyRow | undefined;
} = {
	selectQueue: [],
	insertReturning: [{ id: "new-id" }],
	updateReturning: [{ id: "new-id" }],
	conditionalUpdateRows: [{ bytesUsed: 1 }],
	updated: [],
	quotaRow: undefined,
};

function nextSelect(): AnyRow[] {
	return state.selectQueue.shift() ?? [];
}

function selectBuilder() {
	const rows = nextSelect();
	const step = (): Promise<AnyRow[]> & Record<string, () => unknown> => {
		const p = Promise.resolve(rows) as Promise<AnyRow[]> &
			Record<string, () => unknown>;
		p.from = step;
		p.where = step;
		p.orderBy = step;
		p.limit = step;
		p.innerJoin = step;
		p.leftJoin = step;
		return p;
	};
	return step();
}

function makeDb() {
	const dbObj: AnyRow = {
		select: () => selectBuilder(),
		insert: (table: unknown) => {
			void table;
			const chain: AnyRow = {
				values: () => chain,
				returning: () => Promise.resolve(state.insertReturning),
				onConflictDoNothing: () => chain,
				onConflictDoUpdate: () => chain,
			};
			return chain;
		},
		update: (table: unknown) => ({
			set: (vals: AnyRow) => {
				state.updated.push({ table: tableName(table), set: vals });
				const whereResult = Promise.resolve(
					state.conditionalUpdateRows,
				) as Promise<AnyRow[]> & { returning?: () => Promise<AnyRow[]> };
				whereResult.returning = () => Promise.resolve(state.updateReturning);
				return { where: () => whereResult };
			},
		}),
		query: {
			storageQuota: { findFirst: () => Promise.resolve(state.quotaRow) },
			roxBalances: { findFirst: () => Promise.resolve(undefined) },
		},
		transaction: async (fn: (tx: AnyRow) => Promise<unknown>) => fn(dbObj),
	};
	return dbObj;
}

const fakeDb = makeDb();
mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));

const { driveRouter } = await import("./drive");
const { setDriveStorageForTest } = await import("./storage");
const { setScanObjectForTest } = await import("./scan");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ drive: driveRouter });
const createCaller = createCallerFactory(appRouter);

function authedCaller() {
	return createCaller({
		session: {
			user: { id: "user-1", email: "dev@rox.one" },
			session: { activeOrganizationId: null },
		},
		headers: new Headers(),
		// biome-ignore lint/suspicious/noExplicitAny: minimal test ctx
	} as any);
}

function mockStorage() {
	return {
		kind: "r2" as const,
		presignPut: async () => ({ url: "u", expiresAt: new Date() }),
		presignGet: async () => ({ url: "u", expiresAt: new Date() }),
		head: async () => ({ contentLength: 100 }),
		delete: async () => {},
		copy: async () => {},
	};
}

const FILE_ID = "11111111-1111-4111-8111-111111111111";
const CAP = 10_737_418_240;

beforeEach(() => {
	state.selectQueue = [];
	state.insertReturning = [{ id: "new-id" }];
	state.updateReturning = [{ id: FILE_ID, status: "quarantined" }];
	state.conditionalUpdateRows = [{ bytesUsed: 100 }];
	state.updated = [];
	state.quotaRow = { bytesUsed: 100, quotaBytes: CAP, overageOptIn: false };
	setDriveStorageForTest(mockStorage());
	// Force a quarantined verdict via the production test seam (no module mock).
	setScanObjectForTest(async () => ({
		verdict: "quarantined" as const,
		result: { engine: "stub", verdict: "quarantined", ts: "t" },
	}));
});

afterEach(() => {
	setDriveStorageForTest(undefined);
	setScanObjectForTest(undefined);
});

describe("drive.confirmUpload quarantine release (FIX 2)", () => {
	test("releases the just-committed bytes when the scan quarantines the file", async () => {
		state.selectQueue = [
			// getOwnedFile (pending)
			[
				{
					id: FILE_ID,
					userId: "user-1",
					status: "pending",
					sizeBytes: 100,
					storageKey: "k",
					mediaType: "application/pdf",
				},
			],
		];
		const res = await authedCaller().drive.confirmUpload({ fileId: FILE_ID });
		expect(res.status).toBe("quarantined");

		// Updates in order: claim (pending→scanning), final flip (→quarantined),
		// then the releaseBytes decrement on storage_quota. The release MUST run.
		const quotaUpdates = state.updated.filter(
			(u) => u.table === "storage_quota",
		);
		// commitUpload's conditional add + releaseBytes' decrement = 2 quota writes.
		expect(quotaUpdates.length).toBeGreaterThanOrEqual(2);
		// The last quota write is the release (a bytes_used decrement SQL chunk).
		const release = quotaUpdates[quotaUpdates.length - 1];
		expect(release?.set.bytesUsed).toBeDefined();
	});

	test("does NOT release when the file was already confirmed (no double-free)", async () => {
		state.selectQueue = [
			// getOwnedFile already clean → early return, no commit, no release
			[
				{
					id: FILE_ID,
					userId: "user-1",
					status: "clean",
					sizeBytes: 100,
					storageKey: "k",
					mediaType: "application/pdf",
				},
			],
		];
		const res = await authedCaller().drive.confirmUpload({ fileId: FILE_ID });
		expect(res.alreadyConfirmed).toBe(true);
		expect(
			state.updated.filter((u) => u.table === "storage_quota"),
		).toHaveLength(0);
	});
});
