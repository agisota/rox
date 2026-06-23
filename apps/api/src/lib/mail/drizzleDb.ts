/**
 * Drizzle-backed {@link MailIngestDb} — the real persistence wiring for the
 * inbound ingest (D3 P3). The pure {@link ingestInboundMail} orchestration never
 * imports a db client; this is where its narrow port becomes Drizzle statements
 * against the `mail_*` tables and the D1 `comms_*` unified inbox.
 *
 * The D1 emit (step 8) bridges D3 into the unified inbox: it finds-or-creates a
 * `comms_threads` row keyed by the email Message-ID and inserts a
 * `comms_messages` row with `transport='email'`, so an inbound email lands in
 * the same cross-transport inbox the in-app DMs use — D3 feeds D1 without owning
 * its thread spine. `comms_messages` carries `organization_id` + a NOT-NULL
 * `thread_id`; we use a lightweight thread keyed by the message dedup string.
 */

import { deriveDedupKey } from "@rox/comms-core";
import { db } from "@rox/db/client";
import {
	commsAddresses,
	commsMessages,
	commsThreads,
	mailAddresses,
	mailAttachments,
	mailMessages,
	mailThreads,
} from "@rox/db/schema";
import { publishCommsMessage } from "@rox/shared/comms-events";
import { and, desc, eq, or, sql } from "drizzle-orm";
import type { MailIngestDb } from "./ingest";

type AnyRow = Record<string, unknown>;

/** Build the production {@link MailIngestDb} bound to the live Drizzle client. */
export function createMailIngestDb(): MailIngestDb {
	return {
		async findAddressByValue(address) {
			const [row] = await db
				.select({
					id: mailAddresses.id,
					userId: mailAddresses.userId,
					organizationId: mailAddresses.organizationId,
					status: mailAddresses.status,
					graceUntil: mailAddresses.graceUntil,
				})
				.from(mailAddresses)
				.where(eq(mailAddresses.address, address))
				.limit(1);
			return row ?? null;
		},

		async findMessageByMsgId({ ownerUserId, rfcMessageId }) {
			const [row] = await db
				.select({ id: mailMessages.id, threadId: mailMessages.threadId })
				.from(mailMessages)
				.where(
					and(
						eq(mailMessages.ownerUserId, ownerUserId),
						eq(mailMessages.rfcMessageId, rfcMessageId),
					),
				)
				.limit(1);
			return row ?? null;
		},

		async findThread({ ownerUserId, rootMessageRef, subjectNorm }) {
			const conds = [];
			if (rootMessageRef) {
				conds.push(eq(mailThreads.rootMessageRef, rootMessageRef));
			}
			if (subjectNorm) {
				conds.push(eq(mailThreads.subjectNorm, subjectNorm));
			}
			if (conds.length === 0) return null;
			const [row] = await db
				.select({ id: mailThreads.id })
				.from(mailThreads)
				.where(
					and(
						eq(mailThreads.ownerUserId, ownerUserId),
						conds.length === 1 ? conds[0] : or(...conds),
					),
				)
				.orderBy(desc(mailThreads.lastMessageAt))
				.limit(1);
			return row ?? null;
		},

		async createThread(args) {
			const [row] = await db
				.insert(mailThreads)
				.values({
					organizationId: args.organizationId,
					ownerUserId: args.ownerUserId,
					rootMessageRef: args.rootMessageRef,
					subjectNorm: args.subjectNorm,
					lastMessageAt: args.lastMessageAt,
					messageCount: 1,
				})
				.returning({ id: mailThreads.id });
			if (!row) throw new Error("Failed to create mail thread");
			return row;
		},

		async touchThread({ threadId, lastMessageAt }) {
			await db
				.update(mailThreads)
				.set({
					lastMessageAt,
					messageCount: sql`${mailThreads.messageCount} + 1`,
				})
				.where(eq(mailThreads.id, threadId));
		},

		async insertMessage(row) {
			const [inserted] = await db
				.insert(mailMessages)
				// biome-ignore lint/suspicious/noExplicitAny: orchestration builds the typed row
				.values(row as any)
				.returning({ id: mailMessages.id });
			if (!inserted) throw new Error("Failed to insert mail message");
			return inserted;
		},

		async insertAttachments(rows: AnyRow[]) {
			if (rows.length === 0) return;
			await db
				.insert(mailAttachments)
				// biome-ignore lint/suspicious/noExplicitAny: orchestration builds typed rows
				.values(rows as any);
		},

		async emitToUnifiedInbox(args) {
			// M1: derive the SAME cross-transport dedup key the comms-core router
			// uses — a reply-root id when present, else the sorted participant set —
			// so an inbound email merges with the in-app DM between the same parties
			// instead of forking. The old key (raw Message-ID) never matched the
			// in-app side and forked every email into its own orphan thread.
			const dedupKey =
				deriveDedupKey({
					rootExternalId: args.inReplyTo ?? null,
					participantAddresses: [args.fromAddr, ...args.toAddrs],
				}) ??
				args.rfcMessageId ??
				args.mailMessageId;

			// M1: a redelivered Message-ID hitting a SECOND rox recipient must not
			// 500 on the GLOBAL (transport, external_id) unique. Short-circuit when
			// this external id already exists anywhere (the first recipient's emit
			// already created the shared row); the per-owner mail tables still hold
			// each recipient's own copy.
			if (args.rfcMessageId) {
				const [dup] = await db
					.select({ id: commsMessages.id })
					.from(commsMessages)
					.where(
						and(
							eq(commsMessages.transport, "email"),
							eq(commsMessages.externalId, args.rfcMessageId),
						),
					)
					.limit(1);
				if (dup) return;
			}

			// M1: resolve a known rox sender (an internal email between rox users)
			// to its author user id so the message is attributed; an external
			// sender stays unauthored (no FK contact resolution in this worker path).
			const [senderAddr] = await db
				.select({ userId: commsAddresses.userId })
				.from(commsAddresses)
				.where(
					and(
						eq(commsAddresses.kind, "email"),
						eq(commsAddresses.value, args.fromAddr.trim().toLowerCase()),
						eq(commsAddresses.isAlias, false),
					),
				)
				.limit(1);
			const authorUserId = senderAddr?.userId ?? null;

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
					.set({ lastMessageAt: new Date() })
					.where(eq(commsThreads.id, threadId));
			} else {
				const [thread] = await db
					.insert(commsThreads)
					.values({
						organizationId: args.organizationId,
						subject: args.subject,
						dedupKey,
						lastMessageAt: new Date(),
					})
					.returning({ id: commsThreads.id });
				if (!thread) throw new Error("Failed to create comms thread");
				threadId = thread.id;
			}

			// M1: guard the GLOBAL (transport, external_id) unique — a concurrent
			// second-recipient emit that slipped past the read-check above becomes a
			// no-op instead of a 500.
			const [inserted] = await db
				.insert(commsMessages)
				.values({
					organizationId: args.organizationId,
					threadId,
					transport: "email",
					direction: "inbound",
					authorUserId,
					externalId: args.rfcMessageId,
					inReplyToExternalId: args.inReplyTo,
					body: args.snippet,
					metadata: { mailMessageId: args.mailMessageId, source: "d3-email" },
				})
				.onConflictDoNothing()
				.returning({ id: commsMessages.id });

			// Live delivery (comms SSE): publish ONLY when a NEW row was inserted — a
			// dedup no-op (second recipient / redelivery) must not re-push. The SSE
			// route re-checks participation, so the advisory set is just the recipient
			// owner. Best-effort: never let a publish failure break ingest.
			if (inserted) {
				publishCommsMessage({
					organizationId: args.organizationId,
					threadId,
					messageId: inserted.id,
					transport: "email",
					authorUserId,
					participantUserIds: [args.ownerUserId],
				});
			}
		},
	};
}
