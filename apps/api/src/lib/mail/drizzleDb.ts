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
	commsParticipants,
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

/**
 * Find-or-create the D1 thread for a mail dedup key (FIX 2). The
 * `comms_threads_org_dedup_uniq` partial unique index is the backstop: a
 * concurrent emit that slips past the SELECT collapses on the INSERT
 * (`onConflictDoNothing`) and a re-SELECT then resolves the winner's id — so two
 * recipients racing the same conversation share ONE thread instead of forking.
 * Mirrors the message-insert dedup pattern already used below.
 */
async function findOrCreateCommsThread(
	db: typeof import("@rox/db/client").db,
	args: { organizationId: string; dedupKey: string; subject: string | null },
): Promise<string> {
	const [existing] = await db
		.select({ id: commsThreads.id })
		.from(commsThreads)
		.where(
			and(
				eq(commsThreads.organizationId, args.organizationId),
				eq(commsThreads.dedupKey, args.dedupKey),
			),
		)
		.limit(1);
	if (existing) {
		await db
			.update(commsThreads)
			.set({ lastMessageAt: new Date() })
			.where(eq(commsThreads.id, existing.id));
		return existing.id;
	}

	const [thread] = await db
		.insert(commsThreads)
		.values({
			organizationId: args.organizationId,
			subject: args.subject,
			dedupKey: args.dedupKey,
			lastMessageAt: new Date(),
		})
		.onConflictDoNothing({
			target: [commsThreads.organizationId, commsThreads.dedupKey],
		})
		.returning({ id: commsThreads.id });
	if (thread) return thread.id;

	// Lost the insert race — the concurrent winner's row now exists; re-select it.
	const [winner] = await db
		.select({ id: commsThreads.id })
		.from(commsThreads)
		.where(
			and(
				eq(commsThreads.organizationId, args.organizationId),
				eq(commsThreads.dedupKey, args.dedupKey),
			),
		)
		.limit(1);
	if (!winner) throw new Error("Failed to find-or-create comms thread");
	return winner.id;
}

/**
 * Insert `comms_participants` rows for the given rox users (FIX 1), de-duped and
 * idempotent on the `(thread_id, user_id)` partial unique. Null/blank ids are
 * skipped (an external sender is NOT a rox participant — it resolves to a contact
 * node elsewhere). No-op when there are no resolvable users.
 */
async function ensureCommsParticipants(
	db: typeof import("@rox/db/client").db,
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
	await db
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

			const threadId = await findOrCreateCommsThread(db, {
				organizationId: args.organizationId,
				dedupKey,
				subject: args.subject,
			});

			// FIX 1: a pure-email thread (external sender, no pre-existing in-app DM)
			// must have its mailbox OWNER as a comms_participant — otherwise the SSE
			// leak-gate (`isThreadParticipant`) drops every email event and the
			// participant-scoped comms.listThreads/getThread never surface it. The
			// resolvable rox counterpart (an internal `@rox.one` sender) is added too
			// so an internal email shows for BOTH parties. Idempotent on (thread,user).
			await ensureCommsParticipants(db, {
				organizationId: args.organizationId,
				threadId,
				userIds: [args.ownerUserId, authorUserId],
			});

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
					participantUserIds: [
						...new Set(
							[args.ownerUserId, authorUserId].filter((id): id is string =>
								Boolean(id),
							),
						),
					],
				});
			}
		},
	};
}
