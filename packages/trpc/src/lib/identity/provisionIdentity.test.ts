import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// Stubs `@rox/db/client` so the suite needs no live database. `dbWs.transaction`
// runs its callback against a fake tx that records every insert (table + values
// + whether the row "conflicted"). Each insert returns the rows configured in
// `state.returning` for its table, letting us drive the idempotent (no-op) path.

type AnyRow = Record<string, unknown>;

interface InsertCall {
	table: string;
	values: AnyRow[];
}

const TABLES = new Map<unknown, string>();

const state: {
	inserts: InsertCall[];
	// Per-table returning rows: [] simulates onConflictDoNothing (existing row).
	returning: Record<string, AnyRow[]>;
} = {
	inserts: [],
	returning: {},
};

function insertBuilder(table: unknown) {
	const tableName = TABLES.get(table) ?? "unknown";
	return {
		values(values: AnyRow | AnyRow[]) {
			const arr = Array.isArray(values) ? values : [values];
			state.inserts.push({ table: tableName, values: arr });
			const chain = {
				onConflictDoNothing() {
					return chain;
				},
				returning() {
					return Promise.resolve(state.returning[tableName] ?? [{ id: "new" }]);
				},
			};
			return chain;
		},
	};
}

const fakeTx = { insert: (table: unknown) => insertBuilder(table) };

const fakeDbWs = {
	insert: (table: unknown) => insertBuilder(table),
	transaction: <T>(fn: (tx: typeof fakeTx) => Promise<T>) => fn(fakeTx),
};

mock.module("@rox/db/client", () => ({ db: fakeDbWs, dbWs: fakeDbWs }));

// Tag the real schema table objects so the fake can name them.
const schema = await import("@rox/db/schema");
TABLES.set(schema.commsAddresses, "comms_addresses");
TABLES.set(schema.commsKeypairs, "comms_keypairs");
TABLES.set(schema.storageQuota, "storage_quota");

const { provisionIdentity } = await import("./provisionIdentity");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
	state.inserts = [];
	state.returning = {};
});

describe("provisionIdentity", () => {
	test("derives email + xmpp addresses from the handle (username@rox.one)", async () => {
		const res = await provisionIdentity({
			userId: USER_ID,
			handle: "Mark",
			organizationId: ORG_ID,
		});

		expect(res.addresses.email).toBe("mark@rox.one");
		expect(res.addresses.xmpp).toBe("mark@rox.one");

		const addr = state.inserts.find((i) => i.table === "comms_addresses");
		expect(addr).toBeDefined();
		const kinds = addr?.values.map((v) => v.kind);
		expect(kinds).toContain("email");
		expect(kinds).toContain("xmpp");
		// All address rows are primary, non-alias, derived from the current handle.
		for (const v of addr?.values ?? []) {
			expect(v.value).toBe("mark@rox.one");
			expect(v.isPrimary).toBe(true);
			expect(v.isAlias).toBe(false);
			expect(v.organizationId).toBe(ORG_ID);
			expect(v.userId).toBe(USER_ID);
		}
	});

	test("lazily seeds the shared 10 GiB storage quota", async () => {
		await provisionIdentity({
			userId: USER_ID,
			handle: "mark",
			organizationId: ORG_ID,
		});

		const quota = state.inserts.find((i) => i.table === "storage_quota");
		expect(quota).toBeDefined();
		expect(quota?.values[0]?.userId).toBe(USER_ID);
		// 10 GiB = 10 * 1024^3.
		expect(quota?.values[0]?.quotaBytes).toBe(10_737_418_240);
		expect(quota?.values[0]?.bytesUsed).toBe(0);
	});

	test("does NOT store a keypair when no mesh public key is supplied", async () => {
		await provisionIdentity({
			userId: USER_ID,
			handle: "mark",
			organizationId: ORG_ID,
		});
		expect(
			state.inserts.find((i) => i.table === "comms_keypairs"),
		).toBeUndefined();
	});

	test("stores the PUBLIC key + secret_ref pointer, never a private key", async () => {
		await provisionIdentity({
			userId: USER_ID,
			handle: "mark",
			organizationId: ORG_ID,
			meshPublicKey: "deadbeef",
			meshSecretRef: "keystore://users/mark/mesh",
		});

		const kp = state.inserts.find((i) => i.table === "comms_keypairs");
		expect(kp).toBeDefined();
		expect(kp?.values[0]?.publicKey).toBe("deadbeef");
		expect(kp?.values[0]?.secretRef).toBe("keystore://users/mark/mesh");
		expect(kp?.values[0]?.algo).toBe("ed25519");
		// The shape never carries a private key.
		expect(kp?.values[0]).not.toHaveProperty("privateKey");
		expect(kp?.values[0]).not.toHaveProperty("secretKey");
	});

	test("reports created=true on first provision", async () => {
		const res = await provisionIdentity({
			userId: USER_ID,
			handle: "mark",
			organizationId: ORG_ID,
		});
		expect(res.created).toBe(true);
	});

	test("is idempotent: a re-run that conflicts on every row is a no-op", async () => {
		// Every insert returns [] → onConflictDoNothing matched an existing row.
		state.returning = {
			comms_addresses: [],
			comms_keypairs: [],
			storage_quota: [],
		};
		const res = await provisionIdentity({
			userId: USER_ID,
			handle: "mark",
			organizationId: ORG_ID,
			meshPublicKey: "deadbeef",
		});
		expect(res.created).toBe(false);
		// It still derives + returns the addresses (caller-facing contract).
		expect(res.addresses.email).toBe("mark@rox.one");
	});

	test("throws on an empty handle (cannot derive an address)", async () => {
		await expect(
			provisionIdentity({
				userId: USER_ID,
				handle: "   ",
				organizationId: ORG_ID,
			}),
		).rejects.toThrow();
	});

	test("composes into a caller-supplied transaction", async () => {
		// Passing an explicit tx must NOT open a new dbWs.transaction; the fakeTx
		// records inserts directly.
		await provisionIdentity(
			{ userId: USER_ID, handle: "mark", organizationId: ORG_ID },
			fakeTx,
		);
		expect(
			state.inserts.find((i) => i.table === "comms_addresses"),
		).toBeDefined();
	});
});
