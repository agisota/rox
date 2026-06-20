/**
 * Drizzle-backed {@link MeshIngestDb} — the real persistence wiring for the
 * inbound mesh relay-watcher ingest (D5 Phase 3). The pure {@link ingestInboundMesh}
 * orchestration never imports a db client; this is where its narrow port becomes
 * Drizzle statements against the `mesh_*` tables and the D1 `comms_*` inbox.
 *
 * The D1 emit bridges D5 into the unified inbox: it finds-or-creates a
 * `comms_threads` row keyed by the event thread / reply id and inserts a
 * `comms_messages` row with `transport='mesh'`, so an inbound Nostr DM lands in
 * the same cross-transport inbox the in-app DMs use — D5 feeds D1 without owning
 * its thread spine.
 */

import { db } from "@rox/db/client";
import {
	commsMessages,
	commsThreads,
	meshDeliveryLog,
	meshDevices,
} from "@rox/db/schema";
import { and, eq, gt, or } from "drizzle-orm";
import type { MeshIngestDb } from "./ingest";

/** Build the production {@link MeshIngestDb} bound to the live Drizzle client. */
export function createMeshIngestDb(): MeshIngestDb {
	return {
		async resolveDeviceByPubkey({ nostrPubkey, now }) {
			// An active device always resolves; a `reserved` device resolves only
			// inside its grace window (DQ4 — reserved_until in the future). A revoked
			// device never resolves.
			const [device] = await db
				.select({
					deviceId: meshDevices.id,
					userId: meshDevices.userId,
					organizationId: meshDevices.organizationId,
					status: meshDevices.status,
				})
				.from(meshDevices)
				.where(
					and(
						eq(meshDevices.nostrPubkey, nostrPubkey),
						or(
							eq(meshDevices.status, "active"),
							and(
								eq(meshDevices.status, "reserved"),
								gt(meshDevices.reservedUntil, now),
							),
						),
					),
				)
				.limit(1);
			if (!device) return null;
			return {
				deviceId: device.deviceId,
				userId: device.userId,
				organizationId: device.organizationId,
			};
		},

		async findMessageByEventId(eventId) {
			const [row] = await db
				.select({ id: commsMessages.id })
				.from(commsMessages)
				.where(
					and(
						eq(commsMessages.transport, "mesh"),
						eq(commsMessages.externalId, eventId),
					),
				)
				.limit(1);
			return row ?? null;
		},

		async emitToUnifiedInbox(args) {
			// Find-or-create the D1 thread keyed by the conversation thread / reply id.
			// NOTE: shares the same thin write-write race as D4's find-or-create; it is
			// shared D1 schema used by every transport, so the fix belongs to D1, not
			// this D5 PR — left intentionally out of scope here.
			const dedupKey =
				args.thread ??
				args.replyToEventId ??
				args.eventId ??
				`${args.fromPubkey}|${args.toPubkey}`;

			const [existing] = await db
				.select({ id: commsThreads.id })
				.from(commsThreads)
				.where(
					and(
						eq(commsThreads.organizationId, args.organizationId),
						eq(commsThreads.dedupKey, dedupKey),
					),
				)
				.limit(1);

			let threadId: string;
			if (existing) {
				threadId = existing.id;
				await db
					.update(commsThreads)
					.set({ lastMessageAt: args.createdAt })
					.where(eq(commsThreads.id, threadId));
			} else {
				const [thread] = await db
					.insert(commsThreads)
					.values({
						organizationId: args.organizationId,
						subject: args.subject,
						dedupKey,
						lastMessageAt: args.createdAt,
					})
					.returning({ id: commsThreads.id });
				if (!thread) throw new Error("Failed to create comms thread");
				threadId = thread.id;
			}

			const [message] = await db
				.insert(commsMessages)
				.values({
					organizationId: args.organizationId,
					threadId,
					transport: "mesh",
					direction: "inbound",
					authorUserId: null,
					externalId: args.eventId,
					inReplyToExternalId: args.replyToEventId,
					body: args.body,
					createdAt: args.createdAt,
					metadata: {
						source: "d5-mesh",
						fromPubkey: args.fromPubkey,
						toPubkey: args.toPubkey,
						toUserId: args.toUserId,
						thread: args.thread,
						relayUrl: args.relayUrl,
					},
				})
				.returning({ id: commsMessages.id });
			if (!message) throw new Error("Failed to insert comms message");

			return { messageId: message.id, threadId };
		},

		async recordDelivery(args) {
			await db
				.insert(meshDeliveryLog)
				.values({
					organizationId: args.organizationId,
					messageId: args.messageId,
					idempotencyKey: args.idempotencyKey,
					direction: "inbound",
					status: "delivered",
					meta: {
						fromPubkey: args.fromPubkey,
						toPubkey: args.toPubkey,
						relayUrl: args.relayUrl,
						eventId: args.eventId,
					},
				})
				// Idempotent ledger on (org, idempotency_key, direction). The backing
				// index `mesh_delivery_log_org_key_dir_uniq` is a FULL (non-partial)
				// unique index, so a plain `target` arbiter matches — a relay redelivery
				// (already gated upstream by the comms_messages dedup) collapses here too.
				.onConflictDoNothing({
					target: [
						meshDeliveryLog.organizationId,
						meshDeliveryLog.idempotencyKey,
						meshDeliveryLog.direction,
					],
				});
		},
	};
}
