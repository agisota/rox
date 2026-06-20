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
	commsMessages,
	commsThreads,
	xmppAccounts,
	xmppJidAliases,
	xmppOfflineQueue,
} from "@rox/db/schema";
import { and, eq, gt } from "drizzle-orm";
import type { XmppIngestDb } from "./ingest";

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
				// Idempotent enqueue on (account, origin_id) where present.
				.onConflictDoNothing({
					target: [xmppOfflineQueue.accountId, xmppOfflineQueue.originId],
				});
		},
	};
}
