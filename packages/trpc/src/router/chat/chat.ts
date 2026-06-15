import { db, dbWs } from "@rox/db/client";
import { chatSessionStatusEnum } from "@rox/db/enums";
import { chatSessions, usageRequests } from "@rox/db/schema";
import { getCurrentTxid } from "@rox/db/utils";
import { AVAILABLE_CHAT_MODELS } from "@rox/shared/chat-models";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { uploadChatAttachment } from "./utils/upload-chat-attachment";

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

			const [updated] = await db
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
			const [updated] = await db
				.update(chatSessions)
				.set({ status: input.status })
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, input.organizationId),
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
			const [updated] = await db
				.update(chatSessions)
				.set({ labels: input.labels })
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, input.organizationId),
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
			const [updated] = await db
				.update(chatSessions)
				.set({ title: input.title })
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.createdBy, ctx.session.user.id),
					),
				)
				.returning({ id: chatSessions.id });

			return { updated: !!updated };
		}),
} satisfies TRPCRouterRecord;
