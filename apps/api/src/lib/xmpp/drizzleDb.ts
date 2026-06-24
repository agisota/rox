/**
 * Drizzle-backed {@link XmppIngestDb} — the real persistence wiring for the
 * inbound XMPP bridge ingest (D4 Phase 3). The pure {@link ingestInboundXmpp}
 * orchestration never imports a db client; this is where its narrow port becomes
 * Drizzle statements against the `xmpp_*` tables and the D1 `comms_*` inbox.
 *
 * The D1 emit bridges D4 into the unified inbox: it finds-or-creates a
 * `comms_threads` row keyed by the stanza thread / reply id and inserts a
 * `comms_messages` row with `transport='xmpp'`, so an inbound Jabber message
 * lands in the same cross-transport inbox the in-app DMs use — D4 feeds D1
 * without owning its thread spine.
 */

import { db } from "@rox/db/client";
import {
	commsAddresses,
	commsMessages,
	commsParticipants,
	commsThreads,
	xmppAccounts,
	xmppJidAliases,
	xmppOfflineQueue,
} from "@rox/db/schema";
import { publishCommsMessage } from "@rox/shared/comms-events";
import { and, eq, gt, sql } from "drizzle-orm";
import type { XmppIngestDb } from "./ingest";

/**
 * Insert `comms_participants` rows for the given rox users, de-duped and
 * idempotent on the `(thread_id, user_id)` partial unique
 * (`comms_participants_thread_user_uniq`). Null/blank ids are skipped (an
 * external JID with no rox identity is NOT a participant here). No-op when no
 * rox users are resolvable. Mirrors the mail path's `ensureCommsParticipants`.
 */
async function ensureCommsParticipants(
	dbClient: typeof db,
	args: {
		organizationId: string;
		threadId: string;
		userIds: ReadonlyArray<string | null | undefined>;
	},
): Promise<void> {
	const userIds = [
		...new Set(args.userIds.filter((id): id is string => Boolean(id))),
	];
	if (userIds.length === 0) return;
	await dbClient
		.insert(commsParticipants)
		.values(
			userIds.map((userId) => ({
				organizationId: args.organizationId,
				threadId: args.threadId,
				userId,
				role: "member" as const,
			})),
		)
		.onConflictDoNothing();
}

/** Build the production {@link XmppIngestDb} bound to the live Drizzle client. */
export function createXmppIngestDb(): XmppIngestDb {
	return {
		async resolveAccountByJid({ localpart, domain, now }) {
			// 1. A live, non-deleted account on this (localpart, domain).
			const [account] = await db
				.select({
					accountId: xmppAccounts.id,
					userId: xmppAccounts.userId,
					organizationId: xmppAccounts.organizationId,
					status: xmppAccounts.status,
				})
				.from(xmppAccounts)
				.where(
					and(
						eq(xmppAccounts.jidLocalpart, localpart),
						eq(xmppAccounts.domain, domain),
					),
				)
				.limit(1);
			if (account && account.status === "active") {
				return {
					accountId: account.accountId,
					userId: account.userId,
					organizationId: account.organizationId,
				};
			}

			// 2. A renamed-handle alias still inside its grace window (DQ4) routes to
			//    the current owner. `reserved_until` NULL = permanent reservation with
			//    no active routing, so it does NOT resolve inbound here.
			const [alias] = await db
				.select({
					accountId: xmppAccounts.id,
					userId: xmppAccounts.userId,
					organizationId: xmppAccounts.organizationId,
					status: xmppAccounts.status,
				})
				.from(xmppJidAliases)
				.innerJoin(xmppAccounts, eq(xmppJidAliases.accountId, xmppAccounts.id))
				.where(
					and(
						eq(xmppJidAliases.jidLocalpart, localpart),
						eq(xmppAccounts.domain, domain),
						eq(xmppAccounts.status, "active"),
						gt(xmppJidAliases.reservedUntil, now),
					),
				)
				.limit(1);
			if (alias) {
				return {
					accountId: alias.accountId,
					userId: alias.userId,
					organizationId: alias.organizationId,
				};
			}
			return null;
		},

		async findMessageByStanzaId(stanzaId) {
			const [row] = await db
				.select({ id: commsMessages.id })
				.from(commsMessages)
				.where(
					and(
						eq(commsMessages.transport, "xmpp"),
						eq(commsMessages.externalId, stanzaId),
					),
				)
				.limit(1);
			return row ?? null;
		},

		async emitToUnifiedInbox(args) {
			// Find-or-create the D1 thread keyed by the conversation thread / reply id
			// (so a later reply threads into the same row).
			// NOTE: this find-or-create has a known thin write-write race (two
			// concurrent inbound stanzas for a brand-new dedupKey could both insert a
			// thread). It is shared D1 schema used by every transport, so the fix
			// belongs to D1, not this D4 PR — left intentionally out of scope here.
			const dedupKey =
				args.thread ??
				args.replyToStanzaId ??
				args.stanzaId ??
				`${args.fromJid}|${args.toJid}`;

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

			// Resolve a known rox sender counterpart from the unified comms address
			// book (`xmpp` kind, normalized bare JID). When the inbound message is
			// between two rox users, both join the thread so it surfaces for BOTH
			// parties. An external JID with no rox address has no counterpart here.
			const [senderAddr] = await db
				.select({ userId: commsAddresses.userId })
				.from(commsAddresses)
				.where(
					and(
						eq(commsAddresses.kind, "xmpp"),
						eq(commsAddresses.value, args.fromJid.trim().toLowerCase()),
						eq(commsAddresses.isAlias, false),
					),
				)
				.limit(1);
			const senderUserId = senderAddr?.userId ?? null;

			// FIX: write the recipient (and any resolvable rox sender) as
			// `comms_participants` — without this the SSE leak-gate
			// (`isThreadParticipant`, which reads comms_participants directly and
			// ignores the advisory participantUserIds) drops every published XMPP
			// event and the thread never surfaces via comms.listThreads/getThread.
			// Idempotent on the (thread, user) partial unique. Mirrors the mail path.
			await ensureCommsParticipants(db, {
				organizationId: args.organizationId,
				threadId,
				userIds: [args.toUserId, senderUserId],
			});

			const [message] = await db
				.insert(commsMessages)
				.values({
					organizationId: args.organizationId,
					threadId,
					transport: "xmpp",
					direction: "inbound",
					authorUserId: null,
					externalId: args.stanzaId,
					inReplyToExternalId: args.replyToStanzaId,
					body: args.body,
					createdAt: args.createdAt,
					metadata: {
						source: "d4-xmpp",
						fromJid: args.fromJid,
						toJid: args.toJid,
						toUserId: args.toUserId,
						thread: args.thread,
					},
				})
				.returning({ id: commsMessages.id });
			if (!message) throw new Error("Failed to insert comms message");

			// Live delivery (comms SSE): publish the committed inbound XMPP message.
			// The SSE route re-checks participation against comms_participants, so the
			// advisory set is just the rox participants we wrote (recipient + any
			// resolvable sender). Best-effort — never break ingest on a publish error.
			publishCommsMessage({
				organizationId: args.organizationId,
				threadId,
				messageId: message.id,
				transport: "xmpp",
				authorUserId: null,
				participantUserIds: [
					...new Set(
						[args.toUserId, senderUserId].filter((id): id is string =>
							Boolean(id),
						),
					),
				],
			});

			return { messageId: message.id, threadId };
		},

		async enqueueOffline(args) {
			await db
				.insert(xmppOfflineQueue)
				.values({
					accountId: args.accountId,
					direction: "inbound",
					fromJid: args.fromJid,
					toJid: args.toJid,
					stanzaKind: args.stanzaKind,
					stanza: args.stanza,
					originId: args.originId,
					expiresAt: args.expiresAt,
				})
				// Idempotent enqueue on (account, origin_id) where present. The
				// backing unique index `xmpp_offline_queue_account_origin_uniq` is
				// PARTIAL (`... WHERE origin_id IS NOT NULL`). Postgres only matches a
				// partial unique index as an ON CONFLICT arbiter when the conflict
				// target carries the same predicate, so without this `where` (the
				// arbiter predicate on onConflictDoNothing) the insert throws 42P10
				// ("no unique or exclusion constraint matching the
				// ON CONFLICT specification") and the inbound ingest 500s on any stanza
				// carrying an origin id.
				.onConflictDoNothing({
					target: [xmppOfflineQueue.accountId, xmppOfflineQueue.originId],
					where: sql`${xmppOfflineQueue.originId} IS NOT NULL`,
				});
		},
	};
}
