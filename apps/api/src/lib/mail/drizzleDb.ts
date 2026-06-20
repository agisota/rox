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

import { db } from "@rox/db/client";
import {
	commsMessages,
	commsThreads,
	mailAddresses,
	mailAttachments,
	mailMessages,
	mailThreads,
} from "@rox/db/schema";
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
			// Find-or-create the D1 thread keyed by the email Message-ID (so a reply
			// later threads into the same row). `comms_threads.dedup_key` is the
			// natural key for cross-transport matching.
			const dedupKey =
				args.inReplyTo ?? args.rfcMessageId ?? args.mailMessageId;
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

			await db.insert(commsMessages).values({
				organizationId: args.organizationId,
				threadId,
				transport: "email",
				direction: "inbound",
				authorUserId: null,
				externalId: args.rfcMessageId,
				inReplyToExternalId: args.inReplyTo,
				body: args.snippet,
				metadata: { mailMessageId: args.mailMessageId, source: "d3-email" },
			});
		},
	};
}
