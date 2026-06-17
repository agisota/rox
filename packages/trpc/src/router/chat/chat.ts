import { db, dbWs } from "@rox/db/client";
import { chatSessionStatusEnum } from "@rox/db/enums";
import { chatSessions, usageRequests } from "@rox/db/schema";
import { getCurrentTxid } from "@rox/db/utils";
import {
	AVAILABLE_CHAT_MODELS,
	ROX_CHAT_MODEL_ID,
} from "@rox/shared/chat-models";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgId } from "../utils/active-org";
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

	listSessions: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = ctx.activeOrganizationId;

		if (!organizationId) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "No active organization selected",
			});
		}

		const sessions = await db
			.select({
				id: chatSessions.id,
				title: chatSessions.title,
				workspaceId: chatSessions.workspaceId,
				v2WorkspaceId: chatSessions.v2WorkspaceId,
				status: chatSessions.status,
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
