import {
	AdapterRegistry,
	InAppAdapter,
	MessageRouter,
	type OutboundDraft,
	PRESENCE_TTL_MS,
	type RecipientRef,
} from "@rox/comms-core";
import { db, dbWs } from "@rox/db/client";
import { commsMessages, commsParticipants, commsThreads } from "@rox/db/schema";
import { publishCommsMessage } from "@rox/shared/comms-events";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { assertOrgMembers } from "../integration/assertOrgMembers";
import { requireActiveOrgMembership } from "../utils/active-org";
import { type CommsDb, createCommsPorts } from "./ports";
import {
	getPresenceSchema,
	getThreadSchema,
	listThreadsSchema,
	markReadSchema,
	sendMessageSchema,
	updatePresenceSchema,
} from "./schema";

/**
 * Comms tRPC router — the unified-inbox API surface (D1 Phase 5, T5.1).
 *
 * Every procedure is org-scoped via `requireActiveOrgMembership` (the dashboard/
 * skill-library pattern) and constrains all statements by `organizationId`.
 * `sendMessage` delegates to the `@rox/comms-core` MessageRouter so threading,
 * idempotency, and delivery fan-out stay in the domain core; the router only
 * supplies the Drizzle-backed ports + the in-app adapter. The router is the only
 * registered transport in P0 — email/XMPP/mesh adapters land with D2/D3/D5.
 */

/** Build the router with the in-app adapter + org-scoped Drizzle ports. */
function buildMessageRouter(organizationId: string, txDb: CommsDb = dbWs) {
	const adapters = new AdapterRegistry([new InAppAdapter()]);
	const ports = createCommsPorts(organizationId, txDb);
	return new MessageRouter({ ports, adapters });
}

/**
 * Publish a committed in-app message onto the comms event bus for live SSE
 * delivery. Best-effort: a lookup/publish failure never fails the send (the row
 * is already committed; the client refetch is the backstop).
 */
async function publishInAppMessage(
	organizationId: string,
	threadId: string,
	message: { messageId: string; authorUserId: string | null },
): Promise<void> {
	try {
		const rows = await db
			.select({ userId: commsParticipants.userId })
			.from(commsParticipants)
			.where(
				and(
					eq(commsParticipants.organizationId, organizationId),
					eq(commsParticipants.threadId, threadId),
				),
			);
		const participantUserIds = rows
			.map((r) => r.userId)
			.filter((id): id is string => id !== null);

		publishCommsMessage({
			organizationId,
			threadId,
			messageId: message.messageId,
			transport: "inapp",
			authorUserId: message.authorUserId,
			participantUserIds,
		});
	} catch {
		// Live delivery is non-durable; swallow so the send still succeeds.
	}
}

/**
 * Per-thread unread counts for one caller (I6/E). Returns a `Map<threadId,
 * count>` over the given page of thread ids: the number of `comms_messages` in
 * each thread created strictly after the caller's `comms_participants`
 * watermark AND not authored by the caller. One grouped round-trip (not N+1).
 *
 * - Caller scoping: the inner join binds the caller's participant row, so the
 *   watermark is the caller's own (`last_read_message_id`), never another
 *   participant's.
 * - "Not own": `author_user_id is distinct from <userId>` (NOT `<>`) so
 *   NULL-authored inbound/external messages still count as unread.
 * - Watermark: `last_read_message_id` is a message id; convert to a time
 *   boundary via a scalar subselect and compare with `>` (the watermarked
 *   message itself is already read). NULL watermark short-circuits → all
 *   not-own messages count.
 *
 * The caller must restrict `threadIds` to threads the caller participates in
 * (the inArray is the scope gate). Threads with zero unread are simply absent
 * from the map (callers default to 0).
 */
async function countUnreadByThread(
	organizationId: string,
	userId: string,
	threadIds: string[],
): Promise<Map<string, number>> {
	if (threadIds.length === 0) return new Map();
	const rows = await db
		.select({ threadId: commsMessages.threadId, unread: count() })
		.from(commsMessages)
		.innerJoin(
			commsParticipants,
			and(
				eq(commsParticipants.threadId, commsMessages.threadId),
				eq(commsParticipants.organizationId, commsMessages.organizationId),
				eq(commsParticipants.userId, userId),
			),
		)
		.where(
			and(
				eq(commsMessages.organizationId, organizationId),
				inArray(commsMessages.threadId, threadIds),
				sql`${commsMessages.authorUserId} is distinct from ${userId}`,
				sql`(${commsParticipants.lastReadMessageId} is null or ${commsMessages.createdAt} > (select m2.created_at from ${commsMessages} m2 where m2.id = ${commsParticipants.lastReadMessageId}))`,
			),
		)
		.groupBy(commsMessages.threadId);
	return new Map(rows.map((r) => [r.threadId, Number(r.unread)]));
}

/** Confirm a thread belongs to the org (and the caller participates). */
async function getThreadForOrg(organizationId: string, threadId: string) {
	const [row] = await db
		.select()
		.from(commsThreads)
		.where(
			and(
				eq(commsThreads.id, threadId),
				eq(commsThreads.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
	}
	return row;
}

export const commsRouter = {
	/**
	 * Unified inbox: the org's threads the caller participates in, newest-first.
	 */
	listThreads: protectedProcedure
		.input(listThreadsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			// Threads where the caller is a participant (org-scoped join).
			const memberThreads = await db
				.select({ threadId: commsParticipants.threadId })
				.from(commsParticipants)
				.where(
					and(
						eq(commsParticipants.organizationId, organizationId),
						eq(commsParticipants.userId, userId),
					),
				);
			const threadIds = memberThreads.map((r) => r.threadId);
			if (threadIds.length === 0) return [];

			const threadRows = await db
				.select()
				.from(commsThreads)
				.where(
					and(
						eq(commsThreads.organizationId, organizationId),
						inArray(commsThreads.id, threadIds),
					),
				)
				.orderBy(desc(commsThreads.lastMessageAt))
				.limit(input?.limit ?? 50);

			// One grouped round-trip over the visible page → per-thread unread.
			const pageIds = threadRows.map((t) => t.id);
			const unreadByThread = await countUnreadByThread(
				organizationId,
				userId,
				pageIds,
			);

			// Additive: spread every existing thread column, append unreadCount.
			return threadRows.map((t) => ({
				...t,
				unreadCount: unreadByThread.get(t.id) ?? 0,
			}));
		}),

	/** A thread plus its messages (chronological) and participants. */
	getThread: protectedProcedure
		.input(getThreadSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const thread = await getThreadForOrg(organizationId, input.threadId);

			const participants = await db
				.select()
				.from(commsParticipants)
				.where(
					and(
						eq(commsParticipants.organizationId, organizationId),
						eq(commsParticipants.threadId, thread.id),
					),
				);

			// Caller must participate in the thread to read it.
			const isParticipant = participants.some(
				(p) => p.userId === ctx.session.user.id,
			);
			if (!isParticipant) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a participant of this thread",
				});
			}

			const messages = await db
				.select()
				.from(commsMessages)
				.where(
					and(
						eq(commsMessages.organizationId, organizationId),
						eq(commsMessages.threadId, thread.id),
					),
				)
				.orderBy(asc(commsMessages.createdAt))
				.limit(input.limit ?? 200);

			// Additive sibling field (NOT nested in `thread`): the caller's unread
			// count for this thread, computed the same way as listThreads.
			const unreadByThread = await countUnreadByThread(
				organizationId,
				ctx.session.user.id,
				[thread.id],
			);
			const unreadCount = unreadByThread.get(thread.id) ?? 0;

			return { thread, participants, messages, unreadCount };
		}),

	/**
	 * Send an in-app message. Routes through the comms-core MessageRouter +
	 * InAppAdapter: it resolves recipients, finds/creates the thread, persists the
	 * `comms_messages` row, and writes a `comms_deliveries` row per recipient. The
	 * whole fan-out runs in one transaction so a partial send can't leave a
	 * dangling thread/message.
	 */
	sendMessage: protectedProcedure
		.input(sendMessageSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const authorUserId = ctx.session.user.id;

			// If appending to a thread, confirm org ownership + participation first.
			if (input.threadId) {
				const thread = await getThreadForOrg(organizationId, input.threadId);
				const [membership] = await db
					.select({ id: commsParticipants.id })
					.from(commsParticipants)
					.where(
						and(
							eq(commsParticipants.organizationId, organizationId),
							eq(commsParticipants.threadId, thread.id),
							eq(commsParticipants.userId, authorUserId),
						),
					)
					.limit(1);
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Not a participant of this thread",
					});
				}
			}

			const recipients: RecipientRef[] = input.recipients.map((r) =>
				r.kind === "userId"
					? { kind: "userId", userId: r.userId }
					: { kind: "address", address: r.address },
			);

			// T1/S4: every userId recipient MUST be a member of the caller's org.
			await assertOrgMembers(
				organizationId,
				recipients.flatMap((r) => (r.kind === "userId" ? [r.userId] : [])),
			);

			const draft: OutboundDraft = {
				organizationId,
				authorUserId,
				threadId: input.threadId,
				recipients,
				subject: input.subject ?? null,
				body: input.body,
				bodyHtml: input.bodyHtml ?? null,
				attachments: input.attachments ?? [],
				metadata: input.clientId ? { clientId: input.clientId } : {},
			};

			const result = await dbWs.transaction(async (tx) => {
				const router = buildMessageRouter(organizationId, tx);
				return router.routeOutbound(draft);
			});

			// Live delivery (comms SSE): publish ONLY after the write commits, so an
			// SSE client never sees a message a rolled-back tx never persisted. The
			// route re-checks thread participation before forwarding, so the advisory
			// participant set here is a best-effort optimization, not the auth gate.
			await publishInAppMessage(organizationId, result.thread.id, {
				messageId: result.message.id,
				authorUserId,
			});

			return {
				messageId: result.message.id,
				threadId: result.thread.id,
				deliveries: result.deliveries.map((d) => ({
					deliveryId: d.deliveryId,
					transport: d.recipient.transport,
					status: d.status,
					providerId: d.providerId,
					error: d.error ?? null,
				})),
			};
		}),

	/** Set the caller's read watermark on a thread they participate in. */
	markRead: protectedProcedure
		.input(markReadSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getThreadForOrg(organizationId, input.threadId);

			const rows = await db
				.update(commsParticipants)
				.set({ lastReadMessageId: input.lastReadMessageId })
				.where(
					and(
						eq(commsParticipants.organizationId, organizationId),
						eq(commsParticipants.threadId, input.threadId),
						eq(commsParticipants.userId, ctx.session.user.id),
					),
				)
				.returning({ id: commsParticipants.id });

			if (rows.length === 0) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a participant of this thread",
				});
			}
			return { ok: true as const };
		}),

	/**
	 * Heartbeat the caller's presence for one transport (I4). Writes/merges the
	 * `comms_presence` row so `selectTransport` can see a reachable in-app user
	 * and auto-pick the in-app transport instead of always falling to email. The
	 * heartbeat stamps `updated_at`; a client must re-call within the TTL or its
	 * presence decays to offline.
	 */
	updatePresence: protectedProcedure
		.input(updatePresenceSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const ports = createCommsPorts(organizationId);
			if (!ports.presence.upsert) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Presence writer is unavailable.",
				});
			}
			const presence = await ports.presence.upsert({
				organizationId,
				userId,
				transport: input.transport ?? "inapp",
				state: input.state,
				statusText: input.statusText ?? null,
			});
			return {
				userId: presence.userId,
				state: presence.state,
				updatedAt: presence.updatedAt,
			};
		}),

	/**
	 * Read a user's merged presence (I4). Applies the TTL: a heartbeat older than
	 * `PRESENCE_TTL_MS` is reported as `offline` (and `stale: true`) so a crashed
	 * client never shows reachable. Defaults to the caller; reading another user
	 * is org-scoped (the row is fetched within the caller's active org).
	 */
	presence: protectedProcedure
		.input(getPresenceSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const targetUserId = input?.userId ?? ctx.session.user.id;
			const ports = createCommsPorts(organizationId);
			const row = await ports.presence.get({
				organizationId,
				userId: targetUserId,
			});
			if (!row) {
				return {
					userId: targetUserId,
					state: "offline" as const,
					statusText: null,
					stale: true as const,
					updatedAt: null,
				};
			}
			const stale = Date.now() - row.updatedAt.getTime() > PRESENCE_TTL_MS;
			return {
				userId: row.userId,
				state: stale ? ("offline" as const) : row.state,
				statusText: row.statusText,
				stale,
				updatedAt: row.updatedAt,
			};
		}),
} satisfies TRPCRouterRecord;
