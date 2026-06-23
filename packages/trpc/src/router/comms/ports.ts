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
import { PRESENCE_TTL_MS } from "@rox/comms-core";
import { dbWs } from "@rox/db/client";
import {
	type CommsAddressKind,
	commsAddresses,
	commsDeliveries,
	commsMessages,
	commsParticipants,
	commsPresence,
	commsThreads,
	type CommsAttachment as DbCommsAttachment,
} from "@rox/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { graphService } from "../../lib/graph";
import { resolveAddress } from "../../lib/identity/resolveAddress";

/** A transaction handle compatible with `dbWs.transaction((tx) => …)`. */
export type CommsTx = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/** The db surface the ports need — the WS client OR an open transaction. */
export type CommsDb = typeof dbWs | CommsTx;

/**
 * Aggregate the per-transport presence map into a single user state (I4). Picks
 * the most-available FRESH transport state (online > away > dnd > offline); a
 * heartbeat older than the TTL is ignored so a crashed client decays to offline.
 */
type PresenceAggregate = "online" | "away" | "dnd" | "offline";

function aggregatePresenceState(
	perTransport: Record<string, { state?: string; at?: string }>,
	now: Date = new Date(),
): PresenceAggregate {
	const rank: Record<PresenceAggregate, number> = {
		online: 3,
		away: 2,
		dnd: 1,
		offline: 0,
	};
	const isAggregate = (s: string): s is PresenceAggregate => s in rank;
	let best: PresenceAggregate = "offline";
	for (const entry of Object.values(perTransport)) {
		if (!entry?.state || !isAggregate(entry.state)) continue;
		const at = entry.at ? Date.parse(entry.at) : Number.NaN;
		const fresh = !Number.isNaN(at) && now.getTime() - at <= PRESENCE_TTL_MS;
		if (!fresh) continue;
		if (rank[entry.state] > rank[best]) best = entry.state;
	}
	return best;
}

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
				// GLOBAL + alias-expiry-aware (S2). The org filter is intentionally
				// dropped: identity is global per user (DQ3); an expired alias must
				// NOT resolve to its old owner. `kind` defaults to "email" as a
				// safety net (resolveCounterpart calls without one); Task 9 passes an
				// explicit kind. The downstream user branch consumes only `userId`.
				const resolvedKind = (kind ?? "email") as CommsAddressKind;
				const resolved = await resolveAddress({
					kind: resolvedKind,
					value,
				});
				if (!resolved) return null;
				return {
					id: "",
					organizationId,
					userId: resolved.userId,
					kind: resolvedKind,
					value: value.trim().toLowerCase(),
					isPrimary: !resolved.isAlias,
					isAlias: resolved.isAlias,
					verified: false,
				};
			},

			async findRoxAddressByUser({ userId }) {
				// I2: resolve a userId recipient to its canonical `@rox.one` email so
				// an in-app DM and its email reply share a participant-set dedup key.
				// GLOBAL (identity is per-user, DQ3) — not org-scoped. Prefer the live
				// primary email address.
				const [row] = await db
					.select({ value: commsAddresses.value })
					.from(commsAddresses)
					.where(
						and(
							eq(commsAddresses.userId, userId),
							eq(commsAddresses.kind, "email"),
							eq(commsAddresses.isAlias, false),
						),
					)
					.orderBy(desc(commsAddresses.isPrimary))
					.limit(1);
				return row?.value ?? null;
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

			async findThreadByMessageExternalId({ externalId }) {
				// I2: the transport filter is intentionally DROPPED. A reply-root
				// external id (RFC In-Reply-To / XMPP thread id) must match the
				// message that opened the thread REGARDLESS of which transport it
				// arrived on — otherwise an email reply spawns an orphan thread
				// instead of joining the in-app DM it answers. Still org-scoped.
				const [row] = await db
					.select({ thread: commsThreads })
					.from(commsMessages)
					.innerJoin(commsThreads, eq(commsMessages.threadId, commsThreads.id))
					.where(
						and(
							eq(commsMessages.organizationId, organizationId),
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

			async upsert({ userId, transport, state, statusText, at }) {
				// I4: merge this transport's heartbeat into per_transport, recompute
				// the aggregate state, and stamp updated_at. The primary key is
				// user_id (global presence, DQ3); org is carried for the Electric
				// shape filter. One round-trip read-modify-write inside the caller's
				// tx — presence is low-contention (one writer per user/transport).
				const now = at ?? new Date();
				const [current] = await db
					.select()
					.from(commsPresence)
					.where(eq(commsPresence.userId, userId))
					.limit(1);

				const perTransport = {
					...(current?.perTransport ?? {}),
					[transport]: { state, at: now.toISOString() },
				};
				const aggregate = aggregatePresenceState(perTransport);

				const [row] = await db
					.insert(commsPresence)
					.values({
						userId,
						organizationId,
						state: aggregate,
						perTransport,
						statusText: statusText ?? null,
						updatedAt: now,
					})
					.onConflictDoUpdate({
						target: commsPresence.userId,
						set: {
							organizationId,
							state: aggregate,
							perTransport,
							...(statusText !== undefined ? { statusText } : {}),
							updatedAt: now,
						},
					})
					.returning();
				if (!row) throw new Error("Failed to upsert comms presence");
				return toPresence(row);
			},
		},

		members: {
			async assertMember({ organizationId: org, userId }) {
				const { assertOrgMembers } = await import(
					"../integration/assertOrgMembers"
				);
				await assertOrgMembers(org, [userId]);
			},
		},
	} satisfies CommsPorts;
}
