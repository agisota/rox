import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// Stubs `@rox/db/client` so the suite needs no live database. A queue of
// result-sets drives each `select`; inserts/updates record their values. The
// `transaction` runs its callback against the same fake (the provisionMeshDevice
// drizzle adapter uses select/insert/update on the tx).

type AnyRow = Record<string, unknown>;

const state: {
	selectQueue: AnyRow[][];
	inserted: { values: AnyRow[] }[];
	insertReturning: AnyRow[];
	updated: AnyRow[];
} = {
	selectQueue: [],
	inserted: [],
	insertReturning: [{ id: "device-new", status: "active" }],
	updated: [],
};

function selectBuilder(rows: AnyRow[]) {
	const step = (): Promise<AnyRow[]> & Record<string, () => unknown> => {
		const p = Promise.resolve(rows) as Promise<AnyRow[]> &
			Record<string, () => unknown>;
		p.from = step;
		p.where = step;
		p.innerJoin = step;
		p.leftJoin = step;
		p.orderBy = step;
		p.limit = step;
		return p;
	};
	return step();
}

function nextSelect() {
	return selectBuilder(state.selectQueue.shift() ?? []);
}

function insertChain() {
	return {
		values(vals: AnyRow | AnyRow[]) {
			const arr = Array.isArray(vals) ? vals : [vals];
			state.inserted.push({ values: arr });
			const chain = {
				onConflictDoNothing: () => chain,
				returning: () => Promise.resolve(state.insertReturning),
			};
			return chain;
		},
	};
}

function updateChain() {
	return {
		set(vals: AnyRow) {
			state.updated.push(vals);
			return { where: () => Promise.resolve([]) };
		},
	};
}

const fakeDb = {
	select: () => nextSelect(),
	insert: () => insertChain(),
	update: () => updateChain(),
	delete: () => ({ where: () => Promise.resolve() }),
	transaction: <T>(fn: (tx: typeof fakeDb) => Promise<T>) => fn(fakeDb),
};

mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
mock.module("../integration/utils", () => ({
	verifyOrgMembership: () => Promise.resolve(),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
}));

const { meshRouter } = await import("./mesh");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ mesh: meshRouter });
const createCaller = createCallerFactory(appRouter);

const PUB_A = "a".repeat(64);

function callerFor(activeOrganizationId: string | null, userId = "user-1") {
	return createCaller({
		session: {
			user: { id: userId, email: "dev@rox.one" },
			session: { activeOrganizationId },
		},
		headers: new Headers(),
		// biome-ignore lint/suspicious/noExplicitAny: minimal test ctx
	} as any);
}

beforeEach(() => {
	process.env.MESH_TRANSPORT_ENABLED = "1";
	state.selectQueue = [];
	state.inserted = [];
	state.insertReturning = [{ id: "device-new", status: "active" }];
	state.updated = [];
});

afterEach(() => {
	process.env.MESH_TRANSPORT_ENABLED = undefined;
});

describe("mesh gating", () => {
	test("provisionDevice throws when mesh is disabled", async () => {
		process.env.MESH_TRANSPORT_ENABLED = "0";
		const caller = callerFor("org-1");
		await expect(
			caller.mesh.provisionDevice({ nostrPubkey: PUB_A }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	test("status throws when mesh is disabled", async () => {
		process.env.MESH_TRANSPORT_ENABLED = undefined;
		const caller = callerFor("org-1");
		await expect(caller.mesh.status()).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
	});
});

describe("mesh.provisionDevice", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(
			caller.mesh.provisionDevice({ nostrPubkey: PUB_A }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("provisions a fresh device key (created)", async () => {
		state.selectQueue = [
			[], // findDeviceByUserAndPubkey -> none
			[], // findOwnerOfPubkey -> none
		];
		const caller = callerFor("org-1");
		const res = await caller.mesh.provisionDevice({
			nostrPubkey: PUB_A,
			deviceLabel: "Alice's iPhone",
		});
		expect(res.outcome).toBe("created");
		expect(res.nostrPubkey).toBe(PUB_A);
		expect(state.inserted.length).toBeGreaterThanOrEqual(1);
	});

	test("rejects a malformed pubkey", async () => {
		const caller = callerFor("org-1");
		await expect(
			caller.mesh.provisionDevice({ nostrPubkey: "x".repeat(40) }),
		).rejects.toThrow();
	});
});

describe("mesh.listDevices", () => {
	test("returns the caller's bound devices", async () => {
		state.selectQueue = [
			[
				{
					id: "device-1",
					deviceLabel: "Laptop",
					nostrPubkey: PUB_A,
					status: "active",
				},
			],
		];
		const caller = callerFor("org-1");
		const res = await caller.mesh.listDevices();
		expect(res.devices).toHaveLength(1);
		expect(res.devices[0]?.nostrPubkey).toBe(PUB_A);
	});
});

describe("mesh.status", () => {
	test("reports provisioned when an active device exists", async () => {
		state.selectQueue = [[{ status: "active" }, { status: "reserved" }]];
		const caller = callerFor("org-1");
		const res = await caller.mesh.status();
		expect(res.provisioned).toBe(true);
		expect(res.deviceCount).toBe(2);
		expect(res.activeDeviceCount).toBe(1);
	});

	test("reports not provisioned when no devices exist", async () => {
		state.selectQueue = [[]];
		const caller = callerFor("org-1");
		const res = await caller.mesh.status();
		expect(res.provisioned).toBe(false);
		expect(res.deviceCount).toBe(0);
	});
});
