/**
 * Drizzle-backed {@link CommsPorts} — the server-side persistence wiring for the
 * `@rox/comms-core` {@link MessageRouter} (D1 Phase 5).
 *
 * `@rox/comms-core` is pure domain logic: it expresses every database touch as a
 * narrow injected port and never imports a db client. This module is where those
 * ports become real Drizzle statements against the merged `comms_*` schema. Each
 * store is org-scoped — the org id is captured once when the ports are built and
 * stamped on every read/write, so a query cannot escape its tenant (the same
 * Electric shape-filter contract the schema enforces).
 *
 * The external-contact resolver bridges to the D6 graph (`graphService
 * .resolveIdentity`) so an inbound email from an unknown address find-or-creates
 * a contact node + `identity_links` row — exactly as the spec requires
 * (`comms_participants.contact_entity_id` → `identity_links.contact_entity_id`).
 */

import type {
	CommsAddress,
	CommsAttachment,
	CommsDelivery,
	CommsDeliveryStatus,
	CommsDirection,
	CommsMessage,
	CommsMessageMetadata,
	CommsParticipant,
	CommsPorts,
	CommsPresence,
	CommsThread,
} from "@rox/comms-core";
import { dbWs } from "@rox/db/client";
import {
	commsAddresses,
	commsDeliveries,
	commsMessages,
	commsParticipants,
	commsPresence,
	commsThreads,
	type CommsAttachment as DbCommsAttachment,
} from "@rox/db/schema";
import { and, eq } from "drizzle-orm";
import { graphService } from "../../lib/graph";

/** A transaction handle compatible with `dbWs.transaction((tx) => …)`. */
export type CommsTx = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/** The db surface the ports need — the WS client OR an open transaction. */
export type CommsDb = typeof dbWs | CommsTx;

/** Normalize a db attachment (optional fields) to the strict domain shape. */
function toAttachment(a: DbCommsAttachment): CommsAttachment {
	return {
		name: a.name,
		url: a.url,
		contentType: a.contentType ?? "application/octet-stream",
		size: a.size ?? 0,
	};
}

// ---------------------------------------------------------------------------
// row → domain mappers (Drizzle select shape → comms-core port shape)
// ---------------------------------------------------------------------------

function toAddress(r: typeof commsAddresses.$inferSelect): CommsAddress {
	return {
		id: r.id,
		organizationId: r.organizationId,
		userId: r.userId,
		kind: r.kind,
		value: r.value,
		isPrimary: r.isPrimary,
		isAlias: r.isAlias,
		verified: r.verified,
	};
}

function toThread(r: typeof commsThreads.$inferSelect): CommsThread {
	return {
		id: r.id,
		organizationId: r.organizationId,
		subject: r.subject,
		lastMessageAt: r.lastMessageAt,
		dedupKey: r.dedupKey,
	};
}

function toParticipant(
	r: typeof commsParticipants.$inferSelect,
): CommsParticipant {
	return {
		id: r.id,
		organizationId: r.organizationId,
		threadId: r.threadId,
		userId: r.userId,
		contactEntityId: r.contactEntityId,
		role: r.role,
		lastReadMessageId: r.lastReadMessageId,
	};
}

function toMessage(r: typeof commsMessages.$inferSelect): CommsMessage {
	return {
		id: r.id,
		organizationId: r.organizationId,
		threadId: r.threadId,
		transport: r.transport,
		direction: r.direction,
		authorUserId: r.authorUserId,
		authorContactEntityId: r.authorContactEntityId,
		externalId: r.externalId,
		inReplyToExternalId: r.inReplyToExternalId,
		body: r.body,
		bodyHtml: r.bodyHtml,
		attachments: (r.attachments ?? []).map(toAttachment),
		metadata: r.metadata ?? {},
		createdAt: r.createdAt,
		receivedAt: r.receivedAt,
	};
}

function toDelivery(r: typeof commsDeliveries.$inferSelect): CommsDelivery {
	return {
		id: r.id,
		organizationId: r.organizationId,
		messageId: r.messageId,
		transport: r.transport,
		toAddress: r.toAddress,
		status: r.status,
		providerId: r.providerId,
		error: r.error,
		attempts: r.attempts,
	};
}

function toPresence(r: typeof commsPresence.$inferSelect): CommsPresence {
	return {
		userId: r.userId,
		organizationId: r.organizationId,
		state: r.state,
		perTransport: r.perTransport ?? {},
		statusText: r.statusText,
		updatedAt: r.updatedAt,
	};
}

// ---------------------------------------------------------------------------
// createCommsPorts — org-scoped Drizzle wiring of the comms-core ports
// ---------------------------------------------------------------------------

/**
 * Build a {@link CommsPorts} bound to one organization. All writes that must be
 * atomic (a send fans a message + deliveries) should pass a `tx`; reads can use
 * the root client.
 *
 * @param organizationId the verified active org — every statement is scoped to it.
 * @param db optional db/tx handle (defaults to the WS client `dbWs`).
 */
export function createCommsPorts(
	organizationId: string,
	db: CommsDb = dbWs,
): CommsPorts {
	return {
		addresses: {
			async findByValue({ value, kind }) {
				const conds = [
					eq(commsAddresses.organizationId, organizationId),
					eq(commsAddresses.value, value),
				];
				if (kind) conds.push(eq(commsAddresses.kind, kind));
				const [row] = await db
					.select()
					.from(commsAddresses)
					.where(and(...conds))
					.limit(1);
				return row ? toAddress(row) : null;
			},
		},

		contacts: {
			async resolveContact({ kind, value }) {
				// Bridge to D6: the graph-service is the only writer of contact nodes
				// + identity_links. comms transports overlap identity kinds 1:1 for
				// `email`; anything else resolves under the `chat` identity kind.
				const identityKind = kind === "email" ? "email" : "chat";
				const { contact } = await dbWs.transaction((tx) =>
					graphService.resolveIdentity(tx, {
						orgId: organizationId,
						kind: identityKind,
						value,
					}),
				);
				return { contactEntityId: contact.id };
			},
		},

		threads: {
			async findByDedupKey({ dedupKey }) {
				const [row] = await db
					.select()
					.from(commsThreads)
					.where(
						and(
							eq(commsThreads.organizationId, organizationId),
							eq(commsThreads.dedupKey, dedupKey),
						),
					)
					.limit(1);
				return row ? toThread(row) : null;
			},

			async findThreadByMessageExternalId({ transport, externalId }) {
				const [row] = await db
					.select({ thread: commsThreads })
					.from(commsMessages)
					.innerJoin(commsThreads, eq(commsMessages.threadId, commsThreads.id))
					.where(
						and(
							eq(commsMessages.organizationId, organizationId),
							eq(commsMessages.transport, transport),
							eq(commsMessages.externalId, externalId),
						),
					)
					.limit(1);
				return row ? toThread(row.thread) : null;
			},

			async createThread({ subject, dedupKey, participants }) {
				const [thread] = await db
					.insert(commsThreads)
					.values({ organizationId, subject, dedupKey })
					.returning();
				if (!thread) {
					throw new Error("Failed to create comms thread");
				}
				if (participants.length > 0) {
					await db.insert(commsParticipants).values(
						participants.map((p) => ({
							organizationId,
							threadId: thread.id,
							userId: p.userId,
							contactEntityId: p.contactEntityId,
							role: p.role,
						})),
					);
				}
				return toThread(thread);
			},

			async addParticipants({ threadId, participants }) {
				if (participants.length === 0) return [];
				const rows = await db
					.insert(commsParticipants)
					.values(
						participants.map((p) => ({
							organizationId,
							threadId,
							userId: p.userId,
							contactEntityId: p.contactEntityId,
							role: p.role,
						})),
					)
					// A rox user appears at most once per thread (partial unique idx);
					// re-adding is a no-op so ensureParticipants is idempotent.
					.onConflictDoNothing()
					.returning();
				return rows.map(toParticipant);
			},

			async touchLastMessageAt({ threadId, at }) {
				await db
					.update(commsThreads)
					.set({ lastMessageAt: at })
					.where(
						and(
							eq(commsThreads.id, threadId),
							eq(commsThreads.organizationId, organizationId),
						),
					);
			},
		},

		messages: {
			async findByExternalId({ transport, externalId }) {
				const [row] = await db
					.select()
					.from(commsMessages)
					.where(
						and(
							eq(commsMessages.organizationId, organizationId),
							eq(commsMessages.transport, transport),
							eq(commsMessages.externalId, externalId),
						),
					)
					.limit(1);
				return row ? toMessage(row) : null;
			},

			async insert(args) {
				const [row] = await db
					.insert(commsMessages)
					.values({
						organizationId,
						threadId: args.threadId,
						transport: args.transport,
						direction: args.direction as CommsDirection,
						authorUserId: args.authorUserId,
						authorContactEntityId: args.authorContactEntityId,
						externalId: args.externalId,
						inReplyToExternalId: args.inReplyToExternalId,
						body: args.body,
						bodyHtml: args.bodyHtml,
						attachments: args.attachments as DbCommsAttachment[],
						metadata: args.metadata as CommsMessageMetadata,
						createdAt: args.createdAt,
					})
					.returning();
				if (!row) {
					throw new Error("Failed to insert comms message");
				}
				return toMessage(row);
			},
		},

		deliveries: {
			async insert(args) {
				const [row] = await db
					.insert(commsDeliveries)
					.values({
						organizationId,
						messageId: args.messageId,
						transport: args.transport,
						toAddress: args.toAddress,
						status: args.status as CommsDeliveryStatus,
					})
					.returning();
				if (!row) {
					throw new Error("Failed to insert comms delivery");
				}
				return toDelivery(row);
			},

			async updateStatus({ deliveryId, status, providerId, error }) {
				await db
					.update(commsDeliveries)
					.set({
						status: status as CommsDeliveryStatus,
						...(providerId !== undefined ? { providerId } : {}),
						...(error !== undefined ? { error } : {}),
					})
					.where(
						and(
							eq(commsDeliveries.id, deliveryId),
							eq(commsDeliveries.organizationId, organizationId),
						),
					);
			},
		},

		presence: {
			async get({ userId }) {
				const [row] = await db
					.select()
					.from(commsPresence)
					.where(
						and(
							eq(commsPresence.userId, userId),
							eq(commsPresence.organizationId, organizationId),
						),
					)
					.limit(1);
				return row ? toPresence(row) : null;
			},
		},
	} satisfies CommsPorts;
}
