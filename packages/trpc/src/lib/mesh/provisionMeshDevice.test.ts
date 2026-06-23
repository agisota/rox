import { describe, expect, test } from "bun:test";
import {
	MESH_KEY_GRACE_MS,
	type MeshDeviceRow,
	type ProvisionMeshDeviceDb,
	provisionMeshDevice,
} from "./provisionMeshDevice";

const ALICE = "user-alice";
const PUB_A = "a".repeat(64);
const PUB_B = "b".repeat(64);

/** A tiny in-memory ProvisionMeshDeviceDb fake. */
function makeDb(seed: MeshDeviceRow[] = []) {
	const rows: MeshDeviceRow[] = [...seed];
	let seq = rows.length;
	const reserved: { deviceId: string; reservedUntil: Date }[] = [];

	const db: ProvisionMeshDeviceDb = {
		async findDeviceByUserAndPubkey({ userId, nostrPubkey }) {
			return (
				rows.find(
					(r) => r.userId === userId && r.nostrPubkey === nostrPubkey,
				) ?? null
			);
		},
		async findOwnerOfPubkey(nostrPubkey) {
			const row = rows.find((r) => r.nostrPubkey === nostrPubkey);
			return row ? { userId: row.userId } : null;
		},
		async findDeviceByPubkey(nostrPubkey) {
			return rows.find((r) => r.nostrPubkey === nostrPubkey) ?? null;
		},
		async insertDevice(row) {
			const created: MeshDeviceRow = {
				id: `device-${seq++}`,
				userId: row.userId,
				organizationId: row.organizationId,
				nostrPubkey: row.nostrPubkey,
				status: "active",
			};
			rows.push(created);
			return created;
		},
		async reserveDevice({ deviceId, reservedUntil }) {
			reserved.push({ deviceId, reservedUntil });
			const row = rows.find((r) => r.id === deviceId);
			if (row) row.status = "reserved";
		},
	};
	return { db, rows, reserved };
}

describe("provisionMeshDevice", () => {
	test("first provision inserts an active device (created)", async () => {
		const { db, rows } = makeDb();
		const res = await provisionMeshDevice(db, {
			userId: ALICE,
			organizationId: "org-1",
			nostrPubkey: PUB_A,
			deviceLabel: "Alice's iPhone",
		});
		expect(res.outcome).toBe("created");
		expect(res.nostrPubkey).toBe(PUB_A);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.status).toBe("active");
	});

	test("re-provision with the same pubkey is a no-op (unchanged)", async () => {
		const { db, rows } = makeDb([
			{
				id: "device-0",
				userId: ALICE,
				organizationId: "org-1",
				nostrPubkey: PUB_A,
				status: "active",
			},
		]);
		const res = await provisionMeshDevice(db, {
			userId: ALICE,
			organizationId: "org-1",
			nostrPubkey: PUB_A,
		});
		expect(res.outcome).toBe("unchanged");
		expect(res.deviceId).toBe("device-0");
		expect(rows).toHaveLength(1);
	});

	test("normalizes the pubkey (uppercase hex folds equal)", async () => {
		const { db } = makeDb([
			{
				id: "device-0",
				userId: ALICE,
				organizationId: "org-1",
				nostrPubkey: PUB_A,
				status: "active",
			},
		]);
		const res = await provisionMeshDevice(db, {
			userId: ALICE,
			organizationId: "org-1",
			nostrPubkey: PUB_A.toUpperCase(),
		});
		expect(res.outcome).toBe("unchanged");
	});

	test("rejects a pubkey reserved to another user (DQ4)", async () => {
		const { db } = makeDb([
			{
				id: "device-0",
				userId: "user-bob",
				organizationId: "org-1",
				nostrPubkey: PUB_A,
				status: "reserved",
			},
		]);
		await expect(
			provisionMeshDevice(db, {
				userId: ALICE,
				organizationId: "org-1",
				nostrPubkey: PUB_A,
			}),
		).rejects.toThrow(/reserved to another user/);
	});

	test("rotation reserves the old key (90-day grace) and binds the new one", async () => {
		const { db, rows, reserved } = makeDb([
			{
				id: "device-0",
				userId: ALICE,
				organizationId: "org-1",
				nostrPubkey: PUB_A,
				status: "active",
			},
		]);
		const fixedNow = new Date("2026-06-21T00:00:00.000Z");
		const res = await provisionMeshDevice(
			db,
			{
				userId: ALICE,
				organizationId: "org-1",
				nostrPubkey: PUB_B,
				rotatesFromPubkey: PUB_A,
			},
			() => fixedNow,
		);
		expect(res.outcome).toBe("rotated");
		expect(res.previousPubkey).toBe(PUB_A);
		// Old device reserved with the 90-day grace.
		expect(reserved).toHaveLength(1);
		expect(reserved[0]?.reservedUntil.getTime()).toBe(
			fixedNow.getTime() + MESH_KEY_GRACE_MS,
		);
		// Old row flipped to reserved, new active row inserted.
		expect(rows.find((r) => r.nostrPubkey === PUB_A)?.status).toBe("reserved");
		expect(rows.find((r) => r.nostrPubkey === PUB_B)?.status).toBe("active");
	});

	test("a rotation referencing another user's key does not reserve it", async () => {
		const { db, reserved } = makeDb([
			{
				id: "device-0",
				userId: "user-bob",
				organizationId: "org-1",
				nostrPubkey: PUB_A,
				status: "active",
			},
		]);
		// Alice cannot rotate Bob's key; treated as a fresh bind of PUB_B.
		const res = await provisionMeshDevice(db, {
			userId: ALICE,
			organizationId: "org-1",
			nostrPubkey: PUB_B,
			rotatesFromPubkey: PUB_A,
		});
		expect(res.outcome).toBe("created");
		expect(reserved).toHaveLength(0);
	});

	test("throws on a malformed pubkey", async () => {
		const { db } = makeDb();
		await expect(
			provisionMeshDevice(db, {
				userId: ALICE,
				organizationId: "org-1",
				nostrPubkey: "not-a-pubkey",
			}),
		).rejects.toThrow();
	});
});
