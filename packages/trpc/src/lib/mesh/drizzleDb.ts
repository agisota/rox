/**
 * Drizzle-backed {@link ProvisionMeshDeviceDb} — the server-side persistence
 * wiring for the D5 `provisionMeshDevice` service.
 *
 * `provisionMeshDevice` is pure orchestration: every database touch is a narrow
 * injected port and it never imports a db client. This module is where those
 * ports become real Drizzle statements against the additive `mesh_*` schema. A
 * rotation mutates two rows (reserve old + insert new), so the tRPC router runs
 * the whole call inside a single `dbWs.transaction` and passes the tx here,
 * guaranteeing a partial failure can't leave a half-rotated device.
 */

import { dbWs } from "@rox/db/client";
import { meshDevices } from "@rox/db/schema";
import { and, eq } from "drizzle-orm";
import type {
	MeshDeviceRow,
	ProvisionMeshDeviceDb,
} from "./provisionMeshDevice";

/** A transaction handle compatible with `dbWs.transaction((tx) => ...)`. */
export type MeshTx = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/** The minimal Drizzle surface this adapter needs (real tx OR the base client). */
type MeshDbLike = Pick<MeshTx, "select" | "insert" | "update">;

/**
 * Build a {@link ProvisionMeshDeviceDb} bound to a Drizzle tx/client. Reads
 * return a single row or null; writes return the affected row.
 */
export function createProvisionMeshDeviceDb(
	db: MeshDbLike = dbWs,
): ProvisionMeshDeviceDb {
	return {
		async findDeviceByUserAndPubkey({ userId, nostrPubkey }) {
			const [row] = await db
				.select()
				.from(meshDevices)
				.where(
					and(
						eq(meshDevices.userId, userId),
						eq(meshDevices.nostrPubkey, nostrPubkey),
					),
				)
				.limit(1);
			return row ? toDeviceRow(row) : null;
		},

		async findOwnerOfPubkey(nostrPubkey) {
			const [row] = await db
				.select({ userId: meshDevices.userId })
				.from(meshDevices)
				.where(eq(meshDevices.nostrPubkey, nostrPubkey))
				.limit(1);
			return row ? { userId: row.userId } : null;
		},

		async findDeviceByPubkey(nostrPubkey) {
			const [row] = await db
				.select()
				.from(meshDevices)
				.where(eq(meshDevices.nostrPubkey, nostrPubkey))
				.limit(1);
			return row ? toDeviceRow(row) : null;
		},

		async insertDevice(row) {
			const [inserted] = await db
				.insert(meshDevices)
				.values({
					userId: row.userId,
					organizationId: row.organizationId,
					deviceLabel: row.deviceLabel,
					nostrPubkey: row.nostrPubkey,
					noiseStaticPub: row.noiseStaticPub,
					ed25519Pub: row.ed25519Pub,
				})
				.returning();
			if (!inserted) {
				throw new Error("Failed to insert mesh_devices row");
			}
			return toDeviceRow(inserted);
		},

		async reserveDevice({ deviceId, reservedUntil }) {
			await db
				.update(meshDevices)
				.set({ status: "reserved", reservedUntil })
				.where(eq(meshDevices.id, deviceId));
		},
	};
}

function toDeviceRow(row: typeof meshDevices.$inferSelect): MeshDeviceRow {
	return {
		id: row.id,
		userId: row.userId,
		organizationId: row.organizationId,
		nostrPubkey: row.nostrPubkey,
		status: row.status,
	};
}
