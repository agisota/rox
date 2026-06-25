import { db, dbWs } from "@rox/db/client";
import { chatSessionStatusEnum } from "@rox/db/enums";
import { chatMessages, chatSessions, usageRequests } from "@rox/db/schema";
import { getCurrentTxid } from "@rox/db/utils";
import {
	AVAILABLE_CHAT_MODELS,
	ROX_CHAT_MODEL_ID,
} from "@rox/shared/chat-models";
import type { MessageSearchResult } from "@rox/shared/search";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import {
	buildFacetSearchSql,
	normalizeSearchQuery,
} from "../search/search-sql";
import { requireActiveOrgId } from "../utils/active-org";
import {
	buildLabelFilterConditions,
	listSessionsSchema,
} from "./labels-schema";
import { RECENTS_DEFAULT_LIMIT, recentsInputSchema } from "./recents-schema";
import { searchMessagesSchema } from "./search-messages-schema";
import {
	type ChatCompletionResult,
	deriveSessionTitle,
	persistQuickChatTurns,
	runQuickChatCompletion,
} from "./utils/chat-completion";
import { uploadChatAttachment } from "./utils/upload-chat-attachment";

/** Shape of a single quick-chat turn accepted by `chat.complete`. */
const chatCompletionMessageSchema = z.object({
	role: z.enum(["system", "user", "assistant"]),
	content: z.string().min(1).max(32_000),
});

/** Discriminated reply from `chat.complete` — the renderer switches on `status`. */
export type ChatCompleteOutput =
	| { status: "ok"; sessionId: string; reply: string; persisted: boolean }
	| { status: "needs-user-key"; sessionId: string }
	| { status: "not-configured"; sessionId: string };

export const chatRouter = {
	getModels: protectedProcedure.query(() => {
		return { models: [...AVAILABLE_CHAT_MODELS] };
	}),

	listSessions: protectedProcedure
		.input(listSessionsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			// Optional label filters (F10/F17). Absent params add no conditions, so
			// the query is identical to the previous behaviour (backward compatible).
			const labelConditions = buildLabelFilterConditions({
				labelsColumn: chatSessions.labels,
				labelsAny: input?.labelsAny,
				labelsAll: input?.labelsAll,
			});

			const sessions = await db
				.select({
					id: chatSessions.id,
					title: chatSessions.title,
					workspaceId: chatSessions.workspaceId,
					v2WorkspaceId: chatSessions.v2WorkspaceId,
					status: chatSessions.status,
					pinned: chatSessions.pinned,
					pinnedAt: chatSessions.pinnedAt,
					labels: chatSessions.labels,
					createdAt: chatSessions.createdAt,
					updatedAt: chatSessions.updatedAt,
					lastActiveAt: chatSessions.lastActiveAt,
				})
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.createdBy, ctx.session.user.id),
						eq(chatSessions.organizationId, organizationId),
						...labelConditions,
					),
				)
				.orderBy(desc(chatSessions.lastActiveAt))
				.limit(50);

			if (sessions.length === 0) {
				return { sessions, usageRequests: [] };
			}

			const sessionIds = sessions.map((session) => session.id);
			const usageRows = await db
				.select({
					id: usageRequests.id,
					chatSessionId: usageRequests.chatSessionId,
					modelId: usageRequests.modelId,
					tokensIn: usageRequests.tokensIn,
					tokensOut: usageRequests.tokensOut,
					usdCost: usageRequests.usdCost,
					roxCost: usageRequests.roxCost,
					trace: usageRequests.trace,
					createdAt: usageRequests.createdAt,
				})
				.from(usageRequests)
				.where(
					and(
						eq(usageRequests.userId, ctx.session.user.id),
						inArray(usageRequests.chatSessionId, sessionIds),
					),
				)
				.orderBy(usageRequests.createdAt);

			return { sessions, usageRequests: usageRows };
		}),

	/**
	 * Cross-session recent jumps (F49). Returns the most recently active chat
	 * sessions for the active organization (org-scoped, owned by the caller),
	 * ordered by `lastActiveAt`. Powers the scrollback rail's Recents-flyout so
	 * users can hop between conversations without leaving the rail. Default ~10;
	 * capped at 25.
	 */
	recents: protectedProcedure
		.input(recentsInputSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			const recents = await db
				.select({
					sessionId: chatSessions.id,
					title: chatSessions.title,
					v2WorkspaceId: chatSessions.v2WorkspaceId,
					lastActiveAt: chatSessions.lastActiveAt,
				})
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.createdBy, ctx.session.user.id),
						eq(chatSessions.organizationId, organizationId),
					),
				)
				.orderBy(desc(chatSessions.lastActiveAt))
				.limit(input?.limit ?? RECENTS_DEFAULT_LIMIT);

			return { recents };
		}),

	/**
	 * Full-text search over chat message CONTENT (Hermes-borrow F15).
	 *
	 * Backs the in-conversation filter box's async content lane: the UI shows an
	 * instant title-match the keystroke after the user types (pure, client-side),
	 * then layers these ranked, `<mark>`-highlighted content hits on top once they
	 * resolve. Always org + author scoped (a user only searches their own message
	 * history); `sessionId` narrows to ONE conversation, omitted = every session.
	 *
	 * Reuses the canonical `buildFacetSearchSql([chatMessages.content])` — the SAME
	 * vector the `chat_messages_fts_idx` GIN index is built from — so the scan uses
	 * the index and the highlighted snippet comes from `ts_headline` over the same
	 * document. An empty/whitespace query short-circuits to empty without a DB hit.
	 */
	searchMessages: protectedProcedure
		.input(searchMessagesSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			const query = normalizeSearchQuery(input.query);
			if (!query) {
				return { results: [], totalCount: 0 };
			}

			const cm = buildFacetSearchSql({
				query,
				columns: [chatMessages.content],
			});
			const conds: SQL[] = [
				eq(chatMessages.organizationId, organizationId),
				eq(chatMessages.createdBy, ctx.session.user.id),
				cm.match,
			];
			if (input.sessionId) {
				conds.push(eq(chatMessages.sessionId, input.sessionId));
			}

			const [cnt, rows] = await Promise.all([
				db
					.select({ value: count() })
					.from(chatMessages)
					.where(and(...conds)),
				db
					.select({
						id: chatMessages.id,
						sessionId: chatMessages.sessionId,
						role: chatMessages.role,
						content: chatMessages.content,
						snippet: cm.headline,
						score: cm.rank,
						createdAt: chatMessages.createdAt,
					})
					.from(chatMessages)
					.where(and(...conds))
					.orderBy(
						desc(cm.rank),
						desc(chatMessages.createdAt),
						desc(chatMessages.id),
					)
					.limit(input.limit),
			]);

			const results: MessageSearchResult[] = rows.map((row) => ({
				id: row.id,
				sessionId: row.sessionId,
				role: row.role,
				title: deriveMessageTitle(row.content),
				snippet: row.snippet && row.snippet.length > 0 ? row.snippet : null,
				score:
					typeof row.score === "number" ? row.score : Number(row.score) || 0,
				createdAt: row.createdAt.toISOString(),
			}));

			return { results, totalCount: cnt[0]?.value ?? 0 };
		}),

	getSessionDetail: protectedProcedure
		.input(z.object({ sessionId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			const [session] = await db
				.select({
					id: chatSessions.id,
					title: chatSessions.title,
					workspaceId: chatSessions.workspaceId,
					v2WorkspaceId: chatSessions.v2WorkspaceId,
					status: chatSessions.status,
					pinned: chatSessions.pinned,
					pinnedAt: chatSessions.pinnedAt,
					labels: chatSessions.labels,
					createdAt: chatSessions.createdAt,
					updatedAt: chatSessions.updatedAt,
					lastActiveAt: chatSessions.lastActiveAt,
				})
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.createdBy, ctx.session.user.id),
						eq(chatSessions.organizationId, organizationId),
					),
				)
				.limit(1);

			if (!session) {
				return null;
			}

			const usageRows = await db
				.select({
					id: usageRequests.id,
					modelId: usageRequests.modelId,
					tokensIn: usageRequests.tokensIn,
					tokensOut: usageRequests.tokensOut,
					usdCost: usageRequests.usdCost,
					roxCost: usageRequests.roxCost,
					trace: usageRequests.trace,
					createdAt: usageRequests.createdAt,
				})
				.from(usageRequests)
				.where(
					and(
						eq(usageRequests.userId, ctx.session.user.id),
						eq(usageRequests.chatSessionId, session.id),
					),
				)
				.orderBy(usageRequests.createdAt);

			return { session, usageRequests: usageRows };
		}),

	createSession: protectedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				v2WorkspaceId: z.uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				const [inserted] = await tx
					.insert(chatSessions)
					.values({
						id: input.sessionId,
						organizationId,
						createdBy: ctx.session.user.id,
						v2WorkspaceId: input.v2WorkspaceId,
					})
					.onConflictDoNothing()
					.returning({ id: chatSessions.id });

				if (!inserted) {
					return { txid: null };
				}

				const txid = await getCurrentTxid(tx);
				return { txid };
			});

			return {
				sessionId: input.sessionId,
				txid: result.txid,
			};
		}),

	/**
	 * Quick-chat completion (WS-G). Ensures a project-less `chat_sessions` row
	 * (title from the first user message), calls the model, persists the
	 * user+assistant turns to the durable-streams transcript the Журнал reads, and
	 * returns the full reply.
	 *
	 * Non-streaming by design: the desktop tRPC transport is `httpBatchLink` only
	 * (no WS/subscription link), so reliable token streaming is out of scope here —
	 * the procedure returns the complete reply (an acceptable MVP). The default
	 * model is the Rox house model (ROX R1), answered with the server-side shared
	 * key, so it works for every user with no per-user provider key.
	 */
	complete: protectedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				messages: z.array(chatCompletionMessageSchema).min(1).max(50),
				modelId: z.string().min(1).default(ROX_CHAT_MODEL_ID),
				reasoning: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }): Promise<ChatCompleteOutput> => {
			const organizationId = requireActiveOrgId(ctx);

			const lastUser = [...input.messages]
				.reverse()
				.find((message) => message.role === "user");
			if (!lastUser) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "At least one user message is required",
				});
			}

			// Ensure the session row exists (idempotent on its id). Project-less
			// quick chats carry no workspace; the title is seeded from the first
			// user message so the Журнал / history list have a label.
			await dbWs
				.insert(chatSessions)
				.values({
					id: input.sessionId,
					organizationId,
					createdBy: ctx.session.user.id,
					title: deriveSessionTitle(input.messages[0]?.content ?? ""),
				})
				.onConflictDoNothing();

			let result: ChatCompletionResult;
			try {
				result = await runQuickChatCompletion({
					modelId: input.modelId,
					messages: input.messages,
					reasoning: input.reasoning,
					maxTokens: 4_096,
				});
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Quick-chat request failed",
				});
			}

			if (result.status !== "ok") {
				return { status: result.status, sessionId: input.sessionId };
			}

			const persisted = await persistQuickChatTurns({
				sessionId: input.sessionId,
				userMessage: lastUser.content,
				assistantMessage: result.reply,
			});

			// Bump activity so the session sorts correctly in history and lands in
			// the right day for the Журнал.
			await dbWs
				.update(chatSessions)
				.set({ lastActiveAt: new Date() })
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
						eq(chatSessions.createdBy, ctx.session.user.id),
					),
				);

			return {
				status: "ok",
				sessionId: input.sessionId,
				reply: result.reply,
				persisted,
			};
		}),

	updateSession: protectedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				title: z.string().optional(),
				status: chatSessionStatusEnum.optional(),
				labels: z.array(z.string()).optional(),
				lastActiveAt: z.date().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			const updates: Partial<typeof chatSessions.$inferInsert> = {};
			if (input.title !== undefined) {
				updates.title = input.title;
			}
			if (input.status !== undefined) {
				updates.status = input.status;
			}
			if (input.labels !== undefined) {
				updates.labels = input.labels;
			}
			if (input.lastActiveAt !== undefined) {
				updates.lastActiveAt = input.lastActiveAt;
			}

			if (Object.keys(updates).length === 0) {
				return { updated: false };
			}

			const [updated] = await dbWs
				.update(chatSessions)
				.set(updates)
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
						eq(chatSessions.createdBy, ctx.session.user.id),
					),
				)
				.returning({ id: chatSessions.id });

			return { updated: !!updated };
		}),

	setStatus: protectedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				organizationId: z.uuid(),
				status: chatSessionStatusEnum,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			if (input.organizationId !== organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Organization mismatch",
				});
			}

			const [updated] = await dbWs
				.update(chatSessions)
				.set({ status: input.status })
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
						eq(chatSessions.createdBy, ctx.session.user.id),
					),
				)
				.returning({ id: chatSessions.id });

			return { updated: !!updated };
		}),

	setPinned: protectedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				organizationId: z.uuid(),
				pinned: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			if (input.organizationId !== organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Organization mismatch",
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(chatSessions)
					.set({
						pinned: input.pinned,
						pinnedAt: input.pinned ? new Date() : null,
					})
					.where(
						and(
							eq(chatSessions.id, input.sessionId),
							eq(chatSessions.organizationId, organizationId),
							eq(chatSessions.createdBy, ctx.session.user.id),
						),
					)
					.returning({ id: chatSessions.id });

				if (!updated) return { updated, txid: null };
				const txid = await getCurrentTxid(tx);

				return { updated, txid };
			});
			const { updated, txid } = result;

			return { updated: !!updated, txid };
		}),

	setLabels: protectedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				organizationId: z.uuid(),
				labels: z.array(z.string()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			if (input.organizationId !== organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Organization mismatch",
				});
			}

			const [updated] = await dbWs
				.update(chatSessions)
				.set({ labels: input.labels })
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
						eq(chatSessions.createdBy, ctx.session.user.id),
					),
				)
				.returning({ id: chatSessions.id });

			return { updated: !!updated };
		}),

	deleteSession: protectedProcedure
		.input(z.object({ sessionId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				const [deleted] = await tx
					.delete(chatSessions)
					.where(
						and(
							eq(chatSessions.id, input.sessionId),
							eq(chatSessions.organizationId, organizationId),
							eq(chatSessions.createdBy, ctx.session.user.id),
						),
					)
					.returning({ id: chatSessions.id });

				if (!deleted) return { deleted, txid: null };
				const txid = await getCurrentTxid(tx);

				return { deleted, txid };
			});
			const { deleted, txid } = result;

			return { deleted: !!deleted, txid };
		}),

	uploadAttachment: protectedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				filename: z.string().min(1).max(255),
				mediaType: z.string().min(1).max(255),
				fileData: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			const [sessionRecord] = await db
				.select({
					id: chatSessions.id,
					organizationId: chatSessions.organizationId,
				})
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
						eq(chatSessions.createdBy, ctx.session.user.id),
					),
				)
				.limit(1);

			if (!sessionRecord) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat session not found",
				});
			}

			const result = await uploadChatAttachment({
				...input,
				userId: ctx.session.user.id,
				organizationId: sessionRecord.organizationId,
			});
			return result;
		}),

	updateTitle: protectedProcedure
		.input(z.object({ sessionId: z.uuid(), title: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);

			const [updated] = await dbWs
				.update(chatSessions)
				.set({ title: input.title })
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
						eq(chatSessions.createdBy, ctx.session.user.id),
					),
				)
				.returning({ id: chatSessions.id });

			return { updated: !!updated };
		}),
} satisfies TRPCRouterRecord;

/**
 * Chat messages have no title — derive a short, scannable display line from the
 * content's first non-empty line for a `searchMessages` result row (the full
 * match is still highlighted in the `ts_headline` snippet). Mirrors the
 * cross-entity search router's `deriveMessageTitle`.
 */
function deriveMessageTitle(content: string): string {
	const firstLine = content
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!firstLine) return "Сообщение";
	return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}
