import {
	AdapterRegistry,
	InAppAdapter,
	MessageRouter,
	type OutboundDraft,
	type RecipientRef,
} from "@rox/comms-core";
import { db, dbWs } from "@rox/db/client";
import { commsMessages, commsParticipants, commsThreads } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { type CommsDb, createCommsPorts } from "./ports";
import {
	getThreadSchema,
	listThreadsSchema,
	markReadSchema,
	sendMessageSchema,
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

			return db
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

			return { thread, participants, messages };
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

			return dbWs.transaction(async (tx) => {
				const router = buildMessageRouter(organizationId, tx);
				const result = await router.routeOutbound(draft);
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
			});
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
} satisfies TRPCRouterRecord;
