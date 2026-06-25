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

import {
	deriveDedupKey,
	EmailAdapter,
	normalizeSubject,
} from "@rox/comms-core";
import { db } from "@rox/db/client";
import {
	commsAddresses,
	commsMessages,
	commsParticipants,
	commsThreads,
	mailAddresses,
	mailAttachments,
	mailDrafts,
	mailMessages,
	mailThreads,
	ROX_MAIL_DOMAIN,
	roxBalances,
	roxLedger,
	userProfiles,
} from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	type SQL,
	sql,
} from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { getDriveStorage } from "../drive/storage";
import { ensureBalance } from "../economy";
import { requireActiveOrgMembership } from "../utils/active-org";
import { isOwnedMailAttachmentKey, mailAttachmentKey } from "./attachment-key";
import {
	MAIL_DRAFTS_MAX_PER_USER,
	MAIL_PRESIGN_PUT_TTL_SECONDS,
	MAIL_PRESIGN_TTL_SECONDS,
	MAIL_SEARCH_DEFAULT_LIMIT,
	MAIL_SEND_COST_ROX,
	MAIL_SEND_RATE_MAX,
	MAIL_SEND_RATE_WINDOW_MS,
} from "./config";
import {
	deleteDraftSchema,
	getAttachmentUrlSchema,
	getBodyUrlSchema,
	getMessageSchema,
	getThreadSchema,
	listThreadsSchema,
	markReadSchema,
	presignAttachmentUploadSchema,
	provisionAddressSchema,
	saveDraftSchema,
	searchSchema,
	sendSchema,
	setFlagSchema,
	setFolderSchema,
} from "./schema";
import { buildMailSearchSql, normalizeMailSearchQuery } from "./search-sql";
import { getMailDomain, getMailSendFn } from "./transport";

/**
 * The enriched per-thread summary `mail.listThreads` returns (FN-135 / #697).
 * Extends the raw `mail_threads` row with the server-derived aggregates the
 * EmailView left rail needs: a real unread count (inbound + unread), whether the
 * thread has any attachment, and the (already-on-row) folder + flag. This is the
 * shared contract the search / drafts slices and all three clients build on.
 */
export interface MailThreadSummaryRow {
	id: string;
	organizationId: string;
	ownerUserId: string;
	rootMessageRef: string | null;
	subjectNorm: string | null;
	lastMessageAt: Date;
	messageCount: number;
	folder: (typeof mailThreads.folder)["_"]["data"];
	isFlagged: boolean;
	createdAt: Date;
	/** COUNT(mail_messages WHERE is_read=false AND direction='inbound') for this thread. */
	unreadCount: number;
	/** True when any message in the thread carries an attachment. */
	hasAttachments: boolean;
}

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

/**
 * Resolve the caller's primary `<handle>@rox.one` address row, if provisioned.
 * Returns the row regardless of status (active|grace|disabled) so the send path
 * can short-circuit explicitly on `disabled` (M3 kill-switch) rather than
 * silently treating a disabled address as "not provisioned".
 */
async function getPrimaryAddress(ownerUserId: string) {
	const [row] = await db
		.select()
		.from(mailAddresses)
		.where(
			and(
				eq(mailAddresses.userId, ownerUserId),
				eq(mailAddresses.kind, "primary"),
			),
		)
		.limit(1);
	return row ?? null;
}

/**
 * Resolve the object-storage provider (R2) or throw a clean error when storage
 * is unconfigured (CI/dev). Mail bodies + attachments share the Drive R2 store
 * (DECISIONS.md DQ1), so the Drive seam is reused rather than duplicated.
 */
function requireStorage() {
	const storage = getDriveStorage();
	if (!storage) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Object storage is not configured (missing R2 credentials).",
		});
	}
	return storage;
}

/** A db/tx handle compatible with the outbound D1 emit (root client OR a tx). */
type MailTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Emit an outbound sent mail into the D1 unified inbox (M6). Finds-or-creates a
 * `comms_threads` row keyed by the cross-transport dedup key (reply root, else
 * the sorted participant set) and inserts a `comms_messages` row with
 * `transport='email'`, `direction='outbound'`. The (transport, external_id)
 * global unique is guarded with `onConflictDoNothing`, and `external_id` is
 * `null` for outbound (the provider id is carried in metadata) so it never
 * collides with an inbound RFC Message-ID.
 */
async function emitOutboundToUnifiedInbox(
	tx: MailTx,
	args: {
		organizationId: string;
		authorUserId: string;
		fromAddr: string;
		toAddrs: string[];
		subject: string | null;
		snippet: string;
		providerId: string;
		inReplyTo: string | null;
		mailMessageId: string;
	},
): Promise<void> {
	const dedupKey =
		deriveDedupKey({
			rootExternalId: args.inReplyTo ?? null,
			participantAddresses: [args.fromAddr, ...args.toAddrs],
		}) ?? `mail:${args.mailMessageId}`;

	// FIX 2: find-or-create with the (org, dedup_key) partial unique as a backstop.
	// A SELECT-then-INSERT race (a concurrent inbound emit for the same reply root)
	// collapses on the conflict + re-select, so both halves share ONE thread.
	const [existing] = await tx
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
		await tx
			.update(commsThreads)
			.set({ lastMessageAt: new Date() })
			.where(eq(commsThreads.id, threadId));
	} else {
		const [thread] = await tx
			.insert(commsThreads)
			.values({
				organizationId: args.organizationId,
				subject: args.subject,
				dedupKey,
				lastMessageAt: new Date(),
			})
			.onConflictDoNothing({
				target: [commsThreads.organizationId, commsThreads.dedupKey],
			})
			.returning({ id: commsThreads.id });
		if (thread) {
			threadId = thread.id;
		} else {
			// Lost the insert race — re-select the concurrent winner's thread.
			const [winner] = await tx
				.select({ id: commsThreads.id })
				.from(commsThreads)
				.where(
					and(
						eq(commsThreads.organizationId, args.organizationId),
						eq(commsThreads.dedupKey, dedupKey),
					),
				)
				.limit(1);
			if (!winner) throw new Error("Failed to create comms thread");
			threadId = winner.id;
		}
	}

	// FIX 1: the SENDER (mailbox owner) is always a participant; any recipient that
	// is an internal rox `@rox.one` user becomes one too, so an in-app reply to an
	// outbound email surfaces for both via the participant-scoped comms.* + the SSE
	// leak-gate forwards it. External recipients are NOT rox participants here.
	const recipientUserIds = await resolveRoxRecipientUserIds(tx, args.toAddrs);
	const participantUserIds = [
		...new Set([args.authorUserId, ...recipientUserIds]),
	];
	await tx
		.insert(commsParticipants)
		.values(
			participantUserIds.map((userId) => ({
				organizationId: args.organizationId,
				threadId,
				userId,
				role: "member" as const,
			})),
		)
		.onConflictDoNothing();

	await tx
		.insert(commsMessages)
		.values({
			organizationId: args.organizationId,
			threadId,
			transport: "email",
			direction: "outbound",
			authorUserId: args.authorUserId,
			externalId: null,
			inReplyToExternalId: args.inReplyTo,
			body: args.snippet,
			metadata: {
				mailMessageId: args.mailMessageId,
				providerId: args.providerId,
				source: "d3-email",
			},
		})
		.onConflictDoNothing();
}

/**
 * Resolve which of the given email addresses belong to internal rox users (a
 * live, non-alias `comms_addresses` email row). Used to add the rox counterpart
 * of an internal `@rox.one`→`@rox.one` send as a thread participant. Returns the
 * distinct user ids; an empty input or all-external recipients yields `[]`.
 */
async function resolveRoxRecipientUserIds(
	tx: MailTx,
	toAddrs: string[],
): Promise<string[]> {
	const normalized = [
		...new Set(toAddrs.map((a) => a.trim().toLowerCase()).filter(Boolean)),
	];
	if (normalized.length === 0) return [];
	const rows = await tx
		.select({ userId: commsAddresses.userId })
		.from(commsAddresses)
		.where(
			and(
				eq(commsAddresses.kind, "email"),
				eq(commsAddresses.isAlias, false),
				inArray(commsAddresses.value, normalized),
			),
		);
	return [...new Set(rows.map((r) => r.userId))];
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

	/**
	 * The caller's mailbox threads, newest-first — ENRICHED (FN-135 / #697).
	 *
	 * Each row carries the server-backed `folder` + `is_flagged` placement AND two
	 * derived aggregates the EmailView rail needs: `unreadCount` (COUNT of this
	 * thread's inbound, still-unread messages — the real unread badge, replacing
	 * the client `openedThreadIds` heuristic) and `hasAttachments` (any message in
	 * the thread has an attachment). Both are computed with correlated scalar
	 * sub-selects so the thread row stays 1:1 (no GROUP BY fan-out / no row
	 * multiplication). Optionally filtered to a single `folder`.
	 */
	listThreads: protectedProcedure
		.input(listThreadsSchema)
		.query(async ({ ctx, input }): Promise<MailThreadSummaryRow[]> => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			// Correlated scalar sub-selects keyed on the outer thread id. Each yields
			// one value per thread, so the result stays one row per thread.
			const unreadCount = sql<number>`(
				SELECT COUNT(*)::int FROM ${mailMessages}
				WHERE ${mailMessages.threadId} = ${mailThreads.id}
					AND ${mailMessages.isRead} = false
					AND ${mailMessages.direction} = 'inbound'
			)`;
			const hasAttachments = sql<boolean>`EXISTS (
				SELECT 1 FROM ${mailMessages}
				WHERE ${mailMessages.threadId} = ${mailThreads.id}
					AND ${mailMessages.hasAttachments} = true
			)`;

			const where = and(
				eq(mailThreads.organizationId, organizationId),
				eq(mailThreads.ownerUserId, userId),
				input?.folder ? eq(mailThreads.folder, input.folder) : undefined,
			);

			return db
				.select({
					id: mailThreads.id,
					organizationId: mailThreads.organizationId,
					ownerUserId: mailThreads.ownerUserId,
					rootMessageRef: mailThreads.rootMessageRef,
					subjectNorm: mailThreads.subjectNorm,
					lastMessageAt: mailThreads.lastMessageAt,
					messageCount: mailThreads.messageCount,
					folder: mailThreads.folder,
					isFlagged: mailThreads.isFlagged,
					createdAt: mailThreads.createdAt,
					unreadCount,
					hasAttachments,
				})
				.from(mailThreads)
				.where(where)
				.orderBy(desc(mailThreads.lastMessageAt))
				.limit(input?.limit ?? 50);
		}),

	/**
	 * Move a thread into a server-backed folder (FN-135 / #697): inbox (restore),
	 * archive, spam, or trash. Owner-scoped — only the mailbox owner may refile.
	 * Replaces the desktop EmailView local placement store.
	 */
	setFolder: protectedProcedure
		.input(setFolderSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const rows = await db
				.update(mailThreads)
				.set({ folder: input.folder })
				.where(
					and(
						eq(mailThreads.id, input.threadId),
						eq(mailThreads.organizationId, organizationId),
						eq(mailThreads.ownerUserId, userId),
					),
				)
				.returning({ id: mailThreads.id, folder: mailThreads.folder });
			if (rows.length === 0) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
			}
			return { ok: true as const, folder: rows[0]?.folder };
		}),

	/**
	 * Toggle (or set) the ⭐ flag on a thread (FN-135 / #697). Owner-scoped. When
	 * `flagged` is omitted the current value is flipped in a single UPDATE (no
	 * read-then-write race). Replaces the desktop EmailView local flag store.
	 */
	setFlag: protectedProcedure
		.input(setFlagSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const nextValue: SQL<boolean> | boolean =
				input.flagged === undefined
					? sql<boolean>`NOT ${mailThreads.isFlagged}`
					: input.flagged;
			const rows = await db
				.update(mailThreads)
				.set({ isFlagged: nextValue })
				.where(
					and(
						eq(mailThreads.id, input.threadId),
						eq(mailThreads.organizationId, organizationId),
						eq(mailThreads.ownerUserId, userId),
					),
				)
				.returning({
					id: mailThreads.id,
					isFlagged: mailThreads.isFlagged,
				});
			if (rows.length === 0) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
			}
			return { ok: true as const, isFlagged: rows[0]?.isFlagged };
		}),

	/**
	 * Server-side full-text search across the caller's mailbox (FN-138 / #698).
	 *
	 * Replaces the client-side subject-substring filter with a real Postgres FTS
	 * over each message's `subject || snippet || from_addr || from_name`
	 * (`mail_messages_fts_idx`), then rolls matches up to DISTINCT threads ranked
	 * by best per-thread `ts_rank`. Owner + org scoped. Returns the SAME enriched
	 * {@link MailThreadSummaryRow} shape as `listThreads` so the UI renders search
	 * hits with the identical thread-row component.
	 */
	search: protectedProcedure
		.input(searchSchema)
		.query(async ({ ctx, input }): Promise<MailThreadSummaryRow[]> => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			const normalized = normalizeMailSearchQuery(input.query);
			if (!normalized) return [];
			const { match, rank } = buildMailSearchSql(normalized);

			// Thread ids whose messages match, ranked by the best match in the thread.
			const matched = await db
				.select({
					threadId: mailMessages.threadId,
					score: sql<number>`MAX(${rank})`,
				})
				.from(mailMessages)
				.where(
					and(
						eq(mailMessages.organizationId, organizationId),
						eq(mailMessages.ownerUserId, userId),
						match,
					),
				)
				.groupBy(mailMessages.threadId)
				.orderBy(desc(sql`MAX(${rank})`))
				.limit(input.limit ?? MAIL_SEARCH_DEFAULT_LIMIT);

			const threadIds = matched
				.map((m) => m.threadId)
				.filter((id): id is string => id !== null);
			if (threadIds.length === 0) return [];

			const unreadCount = sql<number>`(
				SELECT COUNT(*)::int FROM ${mailMessages}
				WHERE ${mailMessages.threadId} = ${mailThreads.id}
					AND ${mailMessages.isRead} = false
					AND ${mailMessages.direction} = 'inbound'
			)`;
			const hasAttachments = sql<boolean>`EXISTS (
				SELECT 1 FROM ${mailMessages}
				WHERE ${mailMessages.threadId} = ${mailThreads.id}
					AND ${mailMessages.hasAttachments} = true
			)`;

			const rows = await db
				.select({
					id: mailThreads.id,
					organizationId: mailThreads.organizationId,
					ownerUserId: mailThreads.ownerUserId,
					rootMessageRef: mailThreads.rootMessageRef,
					subjectNorm: mailThreads.subjectNorm,
					lastMessageAt: mailThreads.lastMessageAt,
					messageCount: mailThreads.messageCount,
					folder: mailThreads.folder,
					isFlagged: mailThreads.isFlagged,
					createdAt: mailThreads.createdAt,
					unreadCount,
					hasAttachments,
				})
				.from(mailThreads)
				.where(
					and(
						eq(mailThreads.organizationId, organizationId),
						eq(mailThreads.ownerUserId, userId),
						inArray(mailThreads.id, threadIds),
					),
				);

			// Re-order the thread rows to match the FTS rank order from `matched`.
			const order = new Map(threadIds.map((id, i) => [id, i]));
			return rows.sort(
				(a, b) =>
					(order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
					(order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
			);
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

			// Per-user balance gate (WS-E): the send must be affordable. The actual
			// debit happens atomically inside the persist transaction below; here we
			// only pre-flight so we can fail fast before touching the transport.
			const balance = await ensureBalance(userId);
			if (balance < MAIL_SEND_COST_ROX) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Insufficient Rox balance to send mail.",
				});
			}

			// Per-user rate cap (M3): count this user's outbound sends inside the
			// rolling window. Reuses `created_at` — no extra table.
			const windowStart = new Date(Date.now() - MAIL_SEND_RATE_WINDOW_MS);
			const [recent] = await db
				.select({ n: count() })
				.from(mailMessages)
				.where(
					and(
						eq(mailMessages.ownerUserId, userId),
						eq(mailMessages.direction, "outbound"),
						gt(mailMessages.createdAt, windowStart),
					),
				);
			if ((recent?.n ?? 0) >= MAIL_SEND_RATE_MAX) {
				throw new TRPCError({
					code: "TOO_MANY_REQUESTS",
					message: "Send rate limit exceeded. Try again shortly.",
				});
			}

			const address = await getPrimaryAddress(userId);
			if (!address) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Provision your mailbox before sending.",
				});
			}

			// Kill-switch (M3): a suppressed/disabled address may never send.
			if (address.status === "disabled") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "This mailbox is disabled and cannot send mail.",
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

			// Confirm thread ownership when replying, and derive the RFC References
			// chain server-side from the parent thread rather than trusting the
			// client (M7). The newest message in the thread is the reply parent.
			let parentThread: Awaited<ReturnType<typeof getOwnedThread>> | undefined;
			let derivedInReplyTo: string | null = input.inReplyTo ?? null;
			let derivedReferences: string[] = input.references ?? [];
			if (input.threadId) {
				parentThread = await getOwnedThread(
					organizationId,
					userId,
					input.threadId,
				);

				const [parent] = await db
					.select({
						rfcMessageId: mailMessages.rfcMessageId,
						inReplyTo: mailMessages.inReplyTo,
						referencesIds: mailMessages.referencesIds,
					})
					.from(mailMessages)
					.where(
						and(
							eq(mailMessages.threadId, parentThread.id),
							eq(mailMessages.ownerUserId, userId),
						),
					)
					.orderBy(desc(mailMessages.createdAt))
					.limit(1);

				if (parent) {
					// References = parent's References chain + the parent's Message-ID;
					// In-Reply-To = the parent's Message-ID. Both derived, not trusted.
					const chain = [
						...(parent.referencesIds ?? []),
						...(parent.rfcMessageId ? [parent.rfcMessageId] : []),
					];
					derivedReferences = chain;
					derivedInReplyTo = parent.rfcMessageId ?? derivedInReplyTo;
				}
			}

			// FN-141 (#701): resolve outbound attachments. Each was pre-uploaded by the
			// client to R2 via `presignAttachmentUpload`; here we (1) re-validate the
			// key sits under the caller's OWN `mail/outbound/<userId>/` prefix — a
			// client may never send a key pointing at another user's object — and (2)
			// mint a short-TTL presigned GET so Resend fetches the bytes by URL (never
			// inlined, per DQ1). Requires storage to be configured when attachments
			// are present.
			const inputAttachments = input.attachments ?? [];
			const resolvedAttachments: {
				filename: string;
				contentType: string;
				sizeBytes: number;
				blobKey: string;
				path: string;
			}[] = [];
			if (inputAttachments.length > 0) {
				const storage = requireStorage();
				for (const att of inputAttachments) {
					if (!isOwnedMailAttachmentKey(userId, att.key)) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: "Attachment key is not owned by the caller.",
						});
					}
					const presigned = await storage.presignGet({
						key: att.key,
						downloadFilename: att.filename,
						expiresIn: MAIL_PRESIGN_TTL_SECONDS,
					});
					resolvedAttachments.push({
						filename: att.filename,
						contentType: att.contentType,
						sizeBytes: att.sizeBytes,
						blobKey: att.key,
						path: presigned.url,
					});
				}
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
						inReplyTo: derivedInReplyTo ?? undefined,
						references: derivedReferences,
						cc: input.cc ?? [],
						bcc: input.bcc ?? [],
						// FN-141: deliver attachments to Resend by presigned R2 URL.
						attachments: resolvedAttachments.map((a) => ({
							filename: a.filename,
							path: a.path,
							contentType: a.contentType,
						})),
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

			// Persist + debit atomically (M3): the send cost decrements the WS-E
			// ledger/balance in the SAME transaction as the outbound row, so the
			// spam-cannon gate is no longer a no-op. The thread's `message_count`
			// + `last_message_at` are bumped on replies (M7).
			const row = await db.transaction(async (tx) => {
				const [inserted] = await tx
					.insert(mailMessages)
					.values({
						organizationId,
						ownerUserId: userId,
						addressId: address.id,
						threadId: input.threadId ?? null,
						direction: "outbound",
						status: "sent",
						inReplyTo: derivedInReplyTo,
						referencesIds: derivedReferences.length ? derivedReferences : null,
						fromAddr: address.address,
						toAddrs: input.to,
						ccAddrs: input.cc ?? [],
						bccAddrs: input.bcc ?? [],
						subject: input.subject ?? null,
						snippet: input.body.slice(0, 200),
						hasAttachments: resolvedAttachments.length > 0,
						provider: "resend",
						providerEventId: result.providerId,
						sentAt: new Date(),
					})
					.returning();

				// FN-141 (#701): persist one mail_attachments row per outbound file so
				// the sent message carries its attachment metadata (content already in
				// R2 at `blobKey`). Owner scope is inherited via the parent message.
				if (resolvedAttachments.length > 0 && inserted?.id) {
					await tx.insert(mailAttachments).values(
						resolvedAttachments.map((a) => ({
							messageId: inserted.id,
							organizationId,
							filename: a.filename,
							contentType: a.contentType,
							sizeBytes: a.sizeBytes,
							isInline: false,
							blobKey: a.blobKey,
						})),
					);
				}

				// Debit the WS-E ledger + balance for this send (M3).
				await tx.insert(roxLedger).values({
					userId,
					deltaRox: String(-MAIL_SEND_COST_ROX),
					kind: "mail_send",
				});
				await tx
					.update(roxBalances)
					.set({
						balanceRox: sql`${roxBalances.balanceRox} - ${MAIL_SEND_COST_ROX}`,
					})
					.where(eq(roxBalances.userId, userId));

				// Bump the thread's activity + message_count on replies (M7).
				if (input.threadId) {
					await tx
						.update(mailThreads)
						.set({
							lastMessageAt: new Date(),
							messageCount: sql`${mailThreads.messageCount} + 1`,
						})
						.where(
							and(
								eq(mailThreads.id, input.threadId),
								eq(mailThreads.ownerUserId, userId),
							),
						);
				}

				// M6: emit the outbound mail into the D1 unified inbox so it shows
				// alongside inbound and a reply threads into the same conversation.
				// Keyed on the SAME participant-set dedup key the inbound emit uses
				// (sender `@rox.one` + recipients), or the reply root when present —
				// so the inbox shows BOTH halves of the conversation, not just inbound.
				await emitOutboundToUnifiedInbox(tx, {
					organizationId,
					authorUserId: userId,
					fromAddr: address.address,
					toAddrs: input.to,
					subject: input.subject ?? null,
					snippet: input.body.slice(0, 200),
					providerId: result.providerId,
					inReplyTo: derivedInReplyTo,
					mailMessageId: inserted?.id ?? "",
				});

				return inserted;
			});

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

	/**
	 * Short-TTL presigned R2 GET for one attachment the caller owns (M5). The
	 * attachment is owner-scoped via its parent message: a join confirms the
	 * message belongs to the caller before any URL is minted.
	 */
	getAttachmentUrl: protectedProcedure
		.input(getAttachmentUrlSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const storage = requireStorage();

			const [att] = await db
				.select({
					blobKey: mailAttachments.blobKey,
					filename: mailAttachments.filename,
				})
				.from(mailAttachments)
				.innerJoin(mailMessages, eq(mailAttachments.messageId, mailMessages.id))
				.where(
					and(
						eq(mailAttachments.id, input.attachmentId),
						eq(mailMessages.ownerUserId, userId),
						eq(mailMessages.organizationId, organizationId),
					),
				)
				.limit(1);
			if (!att) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Attachment not found",
				});
			}

			const presigned = await storage.presignGet({
				key: att.blobKey,
				downloadFilename: att.filename,
				expiresIn: MAIL_PRESIGN_TTL_SECONDS,
			});
			return { url: presigned.url, expiresAt: presigned.expiresAt };
		}),

	/**
	 * Short-TTL presigned R2 GET for a message body (M5). Defaults to the
	 * extracted text/plain variant; `variant: "html"` returns the sanitized
	 * text/html object. NOTE: the HTML object stored at `body_html_key` MUST be
	 * server-side sanitized before render (the ingest/sanitize step owns that);
	 * this procedure only mints a download URL, it does not render.
	 */
	getBodyUrl: protectedProcedure
		.input(getBodyUrlSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const storage = requireStorage();

			const [message] = await db
				.select({
					bodyTextKey: mailMessages.bodyTextKey,
					bodyHtmlKey: mailMessages.bodyHtmlKey,
				})
				.from(mailMessages)
				.where(
					and(
						eq(mailMessages.id, input.messageId),
						eq(mailMessages.ownerUserId, userId),
						eq(mailMessages.organizationId, organizationId),
					),
				)
				.limit(1);
			if (!message) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Message not found",
				});
			}

			const key =
				input.variant === "html" ? message.bodyHtmlKey : message.bodyTextKey;
			if (!key) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Body is not available for this message.",
				});
			}

			const presigned = await storage.presignGet({
				key,
				expiresIn: MAIL_PRESIGN_TTL_SECONDS,
			});
			return { url: presigned.url, expiresAt: presigned.expiresAt };
		}),

	/**
	 * Mint a short-TTL presigned R2 PUT for one OUTBOUND attachment (FN-141 /
	 * #701). The key is SERVER-DERIVED from the caller's immutable user id + the
	 * client-supplied content hash (`mail/outbound/<userId>/<sha256>`), so a
	 * client can only ever upload into its own prefix — `mail.send` re-validates
	 * that prefix before trusting any key. The client uploads the bytes directly
	 * to R2, then passes `{ key, filename, contentType, sizeBytes }` back on send.
	 * Inert without R2 creds → `PRECONDITION_FAILED`.
	 */
	presignAttachmentUpload: protectedProcedure
		.input(presignAttachmentUploadSchema)
		.mutation(async ({ ctx, input }) => {
			await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const storage = requireStorage();

			const key = mailAttachmentKey(userId, input.sha256);
			const presigned = await storage.presignPut({
				key,
				contentType: input.contentType,
				contentLength: input.sizeBytes,
				expiresIn: MAIL_PRESIGN_PUT_TTL_SECONDS,
			});
			return {
				key,
				url: presigned.url,
				expiresAt: presigned.expiresAt,
			};
		}),

	/**
	 * The caller's server-backed compose drafts, newest-edited-first (FN-139 /
	 * #699). Replaces the desktop EmailView localStorage draft list so a draft
	 * survives reload and is cross-device. Owner + org scoped.
	 */
	listDrafts: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const userId = ctx.session.user.id;
		return db
			.select()
			.from(mailDrafts)
			.where(
				and(
					eq(mailDrafts.organizationId, organizationId),
					eq(mailDrafts.ownerUserId, userId),
				),
			)
			.orderBy(desc(mailDrafts.updatedAt))
			.limit(MAIL_DRAFTS_MAX_PER_USER);
	}),

	/**
	 * Insert-or-update a compose draft (FN-139 / #699) — the composer autosave
	 * seam. Omitting `id` creates a new draft; passing an owned `id` updates it in
	 * place (and bumps `updated_at`). An update to a draft the caller does not own
	 * 404s rather than silently creating a stray row. Owner + org scoped.
	 */
	saveDraft: protectedProcedure
		.input(saveDraftSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			const fields = {
				threadId: input.threadId ?? null,
				toAddrs: input.to ?? "",
				ccAddrs: input.cc ?? "",
				bccAddrs: input.bcc ?? "",
				subject: input.subject ?? "",
				body: input.body ?? "",
				attachments: input.attachments ?? [],
			};

			if (input.id) {
				const [updated] = await db
					.update(mailDrafts)
					.set({ ...fields, updatedAt: new Date() })
					.where(
						and(
							eq(mailDrafts.id, input.id),
							eq(mailDrafts.organizationId, organizationId),
							eq(mailDrafts.ownerUserId, userId),
						),
					)
					.returning();
				if (!updated) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Draft not found",
					});
				}
				return updated;
			}

			const [created] = await db
				.insert(mailDrafts)
				.values({
					organizationId,
					ownerUserId: userId,
					...fields,
				})
				.returning();
			return created;
		}),

	/** Delete a server-backed draft the caller owns (FN-139 / #699). */
	deleteDraft: protectedProcedure
		.input(deleteDraftSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const rows = await db
				.delete(mailDrafts)
				.where(
					and(
						eq(mailDrafts.id, input.id),
						eq(mailDrafts.organizationId, organizationId),
						eq(mailDrafts.ownerUserId, userId),
					),
				)
				.returning({ id: mailDrafts.id });
			if (rows.length === 0) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
			}
			return { ok: true as const };
		}),
} satisfies TRPCRouterRecord;
