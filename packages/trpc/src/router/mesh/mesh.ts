/**
 * Mesh tRPC router — the D5 device-key provisioning + binding API surface
 * (Phase 1).
 *
 * Every procedure is org-scoped via `requireActiveOrgMembership` (the comms /
 * calendar / xmpp pattern) and operates on the CALLER's own user only — a mesh
 * identity is GLOBAL per user (DQ3), so there is no cross-user read here.
 * `provisionDevice` binds a PUBLIC device key (private keys never leave the
 * client) inside one `dbWs.transaction` so a rotation can't half-apply, and
 * honors DQ4 (permanent reservation + 90-day grace). `listDevices` / `status`
 * surface the caller's bound devices.
 *
 * GATED: the whole surface is inert unless `MESH_TRANSPORT_ENABLED` is truthy
 * (mirrors the xmpp/collab/rtc/mail env gating). When disabled every procedure
 * throws PRECONDITION_FAILED so the schema can ship ahead of the relay-watcher
 * deploy wave.
 */

import { dbWs } from "@rox/db/client";
import { meshDevices } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { createProvisionMeshDeviceDb } from "../../lib/mesh/drizzleDb";
import { provisionMeshDevice } from "../../lib/mesh/provisionMeshDevice";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { listMeshDevicesSchema, provisionMeshDeviceSchema } from "./schema";

/** The mesh transport feature gate (env, additive/optional). */
function meshEnabled(): boolean {
	const v = process.env.MESH_TRANSPORT_ENABLED;
	return v === "1" || v === "true";
}

function requireMesh() {
	if (!meshEnabled()) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Mesh transport is not enabled",
		});
	}
}

export const meshRouter = {
	/**
	 * Provision (or re-affirm / rotate) one of the caller's mesh device keys.
	 * Idempotent on the same pubkey; a rotation reserves the old pubkey under a
	 * 90-day grace (DQ4). Only PUBLIC keys are accepted.
	 */
	provisionDevice: protectedProcedure
		.input(provisionMeshDeviceSchema)
		.mutation(async ({ ctx, input }) => {
			requireMesh();
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			return dbWs.transaction(async (tx) => {
				const db = createProvisionMeshDeviceDb(tx);
				return provisionMeshDevice(db, {
					userId,
					organizationId,
					nostrPubkey: input.nostrPubkey,
					deviceLabel: input.deviceLabel ?? null,
					noiseStaticPub: input.noiseStaticPub ?? null,
					ed25519Pub: input.ed25519Pub ?? null,
					rotatesFromPubkey: input.rotatesFromPubkey ?? null,
				});
			});
		}),

	/** The caller's bound mesh devices (active + reserved), newest first. */
	listDevices: protectedProcedure
		.input(listMeshDevicesSchema)
		.query(async ({ ctx }) => {
			requireMesh();
			await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			const devices = await dbWs
				.select({
					id: meshDevices.id,
					deviceLabel: meshDevices.deviceLabel,
					nostrPubkey: meshDevices.nostrPubkey,
					status: meshDevices.status,
					reservedUntil: meshDevices.reservedUntil,
					lastSeenAt: meshDevices.lastSeenAt,
					createdAt: meshDevices.createdAt,
				})
				.from(meshDevices)
				.where(eq(meshDevices.userId, userId))
				.orderBy(desc(meshDevices.createdAt));

			return { devices };
		}),

	/** A compact mesh-identity health probe for the UI. */
	status: protectedProcedure
		.input(listMeshDevicesSchema)
		.query(async ({ ctx }) => {
			requireMesh();
			await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			const devices = await dbWs
				.select({ status: meshDevices.status })
				.from(meshDevices)
				.where(eq(meshDevices.userId, userId));

			const activeCount = devices.filter((d) => d.status === "active").length;
			return {
				provisioned: activeCount > 0,
				deviceCount: devices.length,
				activeDeviceCount: activeCount,
			};
		}),
} satisfies TRPCRouterRecord;
