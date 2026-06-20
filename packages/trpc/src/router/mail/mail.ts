/**
 * Mail tRPC router (D3 P3) — the per-user `<handle>@rox.one` mailbox API.
 *
 * INBOUND ingest is the `/api/mail/inbound` route (apps/api); this router owns
 * the read surface (threads/messages) + provisioning + OUTBOUND send. Every
 * procedure is org-scoped via `requireActiveOrgMembership` AND owner-scoped to
 * `ctx.session.user.id` — a user only ever sees their own mailbox (DQ3: the
 * mailbox is global per user; org is the Electric shape filter, not a silo).
 *
 * Outbound (`send`) goes through the `@rox/comms-core` {@link EmailAdapter} with
 * an INJECTED Resend send fn (the guarded {@link getMailSendFn} seam). The path
 * is inert without `MAIL_OUTBOUND_ENABLED` + `RESEND_API_KEY` — it then fails
 * with a clean `PRECONDITION_FAILED`. A per-user quota/rate gate runs first via
 * the WS-E economy `ensureBalance` helper (no new ledger kind is introduced).
 *
 * Bodies/attachments live in R2 (D8); these rows hold only metadata + pointers.
 */

import { EmailAdapter, normalizeSubject } from "@rox/comms-core";
import { db } from "@rox/db/client";
import {
	mailAddresses,
	mailAttachments,
	mailMessages,
	mailThreads,
	ROX_MAIL_DOMAIN,
	userProfiles,
} from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { ensureBalance } from "../economy";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	getMessageSchema,
	getThreadSchema,
	listThreadsSchema,
	markReadSchema,
	provisionAddressSchema,
	sendSchema,
} from "./schema";
import { getMailDomain, getMailSendFn } from "./transport";

/** Confirm a thread belongs to the org AND is owned by the caller. */
async function getOwnedThread(
	organizationId: string,
	ownerUserId: string,
	threadId: string,
) {
	const [row] = await db
		.select()
		.from(mailThreads)
		.where(
			and(
				eq(mailThreads.id, threadId),
				eq(mailThreads.organizationId, organizationId),
				eq(mailThreads.ownerUserId, ownerUserId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
	}
	return row;
}

/** Resolve the caller's primary `<handle>@rox.one` address row, if provisioned. */
async function getPrimaryAddress(ownerUserId: string) {
	const [row] = await db
		.select()
		.from(mailAddresses)
		.where(
			and(
				eq(mailAddresses.userId, ownerUserId),
				eq(mailAddresses.kind, "primary"),
				eq(mailAddresses.status, "active"),
			),
		)
		.limit(1);
	return row ?? null;
}

export const mailRouter = {
	/**
	 * Provision (or re-affirm) the caller's routable `<handle>@rox.one` address.
	 * Idempotent: the global UNIQUE on `address` guards duplicates. The handle is
	 * taken from the caller's `user_profiles.handle` unless overridden.
	 */
	provisionAddress: protectedProcedure
		.input(provisionAddressSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			let handle = input.handle?.trim().toLowerCase();
			if (!handle) {
				const [profile] = await db
					.select({ handle: userProfiles.handle })
					.from(userProfiles)
					.where(eq(userProfiles.userId, userId))
					.limit(1);
				handle = profile?.handle?.trim().toLowerCase() ?? undefined;
			}
			if (!handle) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Set a handle before provisioning your mailbox.",
				});
			}

			const address = `${handle}@${ROX_MAIL_DOMAIN}`;

			// Global reservation guard: if someone else already owns this address,
			// refuse rather than silently no-op into their mailbox (DQ4).
			const [existing] = await db
				.select()
				.from(mailAddresses)
				.where(eq(mailAddresses.address, address))
				.limit(1);
			if (existing && existing.userId !== userId) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "That address is already reserved.",
				});
			}
			if (existing) return existing;

			const [row] = await db
				.insert(mailAddresses)
				.values({
					userId,
					organizationId,
					localPart: handle,
					domain: ROX_MAIL_DOMAIN,
					address,
					kind: "primary",
					status: "active",
				})
				.returning();
			return row;
		}),

	/** The caller's mailbox threads, newest-first. */
	listThreads: protectedProcedure
		.input(listThreadsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return db
				.select()
				.from(mailThreads)
				.where(
					and(
						eq(mailThreads.organizationId, organizationId),
						eq(mailThreads.ownerUserId, ctx.session.user.id),
					),
				)
				.orderBy(desc(mailThreads.lastMessageAt))
				.limit(input?.limit ?? 50);
		}),

	/** A thread plus its messages (chronological). Owner-scoped. */
	getThread: protectedProcedure
		.input(getThreadSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const thread = await getOwnedThread(
				organizationId,
				userId,
				input.threadId,
			);

			const messages = await db
				.select()
				.from(mailMessages)
				.where(
					and(
						eq(mailMessages.organizationId, organizationId),
						eq(mailMessages.ownerUserId, userId),
						eq(mailMessages.threadId, thread.id),
					),
				)
				.orderBy(asc(mailMessages.createdAt))
				.limit(input.limit ?? 200);

			return { thread, messages };
		}),

	/** A single message + its attachment pointers. Owner-scoped. */
	getMessage: protectedProcedure
		.input(getMessageSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			const [message] = await db
				.select()
				.from(mailMessages)
				.where(
					and(
						eq(mailMessages.id, input.messageId),
						eq(mailMessages.organizationId, organizationId),
						eq(mailMessages.ownerUserId, userId),
					),
				)
				.limit(1);
			if (!message) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Message not found",
				});
			}

			const attachments = await db
				.select()
				.from(mailAttachments)
				.where(eq(mailAttachments.messageId, message.id));

			return { message, attachments };
		}),

	/**
	 * Send (compose or reply) from `<handle>@rox.one`. Quota-gated, then sent via
	 * the injected Resend transport. Persists an outbound `mail_messages` row
	 * (direction=out). Inert without outbound creds → `PRECONDITION_FAILED`.
	 */
	send: protectedProcedure
		.input(sendSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			// Per-user quota/rate gate (WS-E): a non-positive balance blocks sending.
			// Reuses the economy helper; no new ledger kind is introduced.
			const balance = await ensureBalance(userId);
			if (balance <= 0) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Insufficient Rox balance to send mail.",
				});
			}

			const address = await getPrimaryAddress(userId);
			if (!address) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Provision your mailbox before sending.",
				});
			}

			// Outbound transport gate: inert without MAIL_OUTBOUND_ENABLED + key.
			const sendFn = getMailSendFn();
			if (!sendFn) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Outbound email is not configured.",
				});
			}

			// Confirm thread ownership when replying.
			if (input.threadId) {
				await getOwnedThread(organizationId, userId, input.threadId);
			}

			const adapter = new EmailAdapter({
				send: sendFn,
				domain: getMailDomain(),
				resolveFromAddress: async () => address.address,
			});

			// The adapter builds RFC headers (From, Reply-To, In-Reply-To / References)
			// and hands the payload to the injected Resend send fn.
			const result = await adapter.send(
				{
					organizationId,
					authorUserId: userId,
					recipients: input.to.map((a) => ({ kind: "address", address: a })),
					subject: input.subject ?? null,
					body: input.body,
					bodyHtml: input.bodyHtml ?? null,
					metadata: {
						inReplyTo: input.inReplyTo ?? undefined,
						references: input.references ?? [],
						cc: input.cc ?? [],
						bcc: input.bcc ?? [],
					},
				},
				{
					toAddress: input.to[0] ?? "",
					delivery: {
						id: "outbound",
						messageId: "outbound",
						transport: "email",
					},
				},
			);

			// Persist the outbound envelope (body lives in the provider/R2, not here).
			const [row] = await db
				.insert(mailMessages)
				.values({
					organizationId,
					ownerUserId: userId,
					addressId: address.id,
					threadId: input.threadId ?? null,
					direction: "outbound",
					status: "sent",
					inReplyTo: input.inReplyTo ?? null,
					referencesIds: input.references ?? null,
					fromAddr: address.address,
					toAddrs: input.to,
					ccAddrs: input.cc ?? [],
					bccAddrs: input.bcc ?? [],
					subject: input.subject ?? null,
					snippet: input.body.slice(0, 200),
					hasAttachments: false,
					provider: "resend",
					providerEventId: result.providerId,
					sentAt: new Date(),
				})
				.returning();

			// Bump the thread's last-activity timestamp on replies.
			if (input.threadId) {
				await db
					.update(mailThreads)
					.set({ lastMessageAt: new Date() })
					.where(
						and(
							eq(mailThreads.id, input.threadId),
							eq(mailThreads.ownerUserId, userId),
						),
					);
			}

			return {
				messageId: row?.id ?? "",
				providerId: result.providerId,
				subjectNorm: normalizeSubject(input.subject),
			};
		}),

	/** Set the read flag on a message the caller owns. */
	markRead: protectedProcedure
		.input(markReadSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			const rows = await db
				.update(mailMessages)
				.set({ isRead: input.isRead ?? true })
				.where(
					and(
						eq(mailMessages.id, input.messageId),
						eq(mailMessages.organizationId, organizationId),
						eq(mailMessages.ownerUserId, userId),
					),
				)
				.returning({ id: mailMessages.id });

			if (rows.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Message not found",
				});
			}
			return { ok: true as const };
		}),
} satisfies TRPCRouterRecord;
