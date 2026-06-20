import { db } from "@rox/db/client";
import {
	members,
	roxBalances,
	roxLedger,
	usageRequests,
	users,
} from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { generateImagePathname, uploadImage } from "../../lib/upload";
import { protectedProcedure } from "../../trpc";
import { ensureBalance } from "../economy/economy.service";

export const userRouter = {
	me: protectedProcedure.query(({ ctx }) => ctx.session.user),

	myOrganization: protectedProcedure.query(async ({ ctx }) => {
		const activeOrganizationId = ctx.activeOrganizationId;

		const membership = await db.query.members.findFirst({
			where: activeOrganizationId
				? and(
						eq(members.userId, ctx.session.user.id),
						eq(members.organizationId, activeOrganizationId),
					)
				: eq(members.userId, ctx.session.user.id),
			orderBy: desc(members.createdAt),
			with: {
				organization: true,
			},
		});

		return membership?.organization ?? null;
	}),

	myOrganizations: protectedProcedure.query(async ({ ctx }) => {
		const memberships = await db.query.members.findMany({
			where: eq(members.userId, ctx.session.user.id),
			orderBy: desc(members.createdAt),
			with: {
				organization: true,
			},
		});

		return memberships.map((m) => m.organization);
	}),

	accountOverview: protectedProcedure.query(async ({ ctx }) => {
		const userId = ctx.session.user.id;
		const organizationId = ctx.activeOrganizationId;

		// T8: single-source the seed-on-first-read via the economy service so the
		// 500-Rox starting grant logic lives in exactly one place. The read shape
		// below is unchanged so the desktop AccountUsagePanel keeps compiling.
		await ensureBalance(userId);

		const balance = await db.query.roxBalances.findFirst({
			where: eq(roxBalances.userId, userId),
			columns: {
				balanceRox: true,
				updatedAt: true,
			},
		});

		const ledgerRows = await db
			.select({
				id: roxLedger.id,
				deltaRox: roxLedger.deltaRox,
				kind: roxLedger.kind,
				usageRequestId: roxLedger.usageRequestId,
				topupId: roxLedger.topupId,
				createdAt: roxLedger.createdAt,
			})
			.from(roxLedger)
			.where(eq(roxLedger.userId, userId))
			.orderBy(desc(roxLedger.createdAt))
			.limit(100);

		const usageWhere = organizationId
			? and(
					eq(usageRequests.userId, userId),
					eq(usageRequests.organizationId, organizationId),
				)
			: eq(usageRequests.userId, userId);

		const usageRows = await db
			.select({
				id: usageRequests.id,
				organizationId: usageRequests.organizationId,
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
			.where(usageWhere)
			.orderBy(desc(usageRequests.createdAt))
			.limit(500);

		return {
			organizationId,
			balance: {
				balanceRox: balance?.balanceRox ?? "500",
				updatedAt: balance?.updatedAt ?? new Date(),
			},
			ledger: ledgerRows,
			usageRequests: usageRows,
		};
	}),

	updateProfile: protectedProcedure
		.input(z.object({ name: z.string().min(1).max(100) }))
		.mutation(async ({ ctx, input }) => {
			const [updatedUser] = await db
				.update(users)
				.set({ name: input.name })
				.where(eq(users.id, ctx.session.user.id))
				.returning();
			return updatedUser;
		}),

	completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
		const [updatedUser] = await db
			.update(users)
			.set({ onboardedAt: new Date() })
			.where(eq(users.id, ctx.session.user.id))
			.returning();
		return updatedUser;
	}),

	uploadAvatar: protectedProcedure
		.input(
			z.object({
				fileData: z.string(),
				fileName: z.string(),
				mimeType: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;

			const user = await db.query.users.findFirst({
				where: eq(users.id, userId),
			});

			if (!user) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found",
				});
			}

			const pathname = generateImagePathname({
				prefix: `user/${userId}/avatar`,
				mimeType: input.mimeType,
			});

			try {
				const url = await uploadImage({
					fileData: input.fileData,
					mimeType: input.mimeType,
					pathname,
					existingUrl: user.image,
				});

				const [updatedUser] = await db
					.update(users)
					.set({ image: url })
					.where(eq(users.id, userId))
					.returning();

				return { success: true, url, user: updatedUser };
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				console.error("[user/uploadAvatar] Upload failed:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to upload avatar",
				});
			}
		}),
} satisfies TRPCRouterRecord;
