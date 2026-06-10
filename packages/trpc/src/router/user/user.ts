import { db } from "@rox/db/client";
import {
	achievements,
	members,
	usageDaily,
	userAchievements,
	userProfiles,
	users,
} from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { generateImagePathname, uploadImage } from "../../lib/upload";
import { protectedProcedure } from "../../trpc";

const profileInputSchema = z.object({
	handle: z
		.string()
		.trim()
		.min(3)
		.max(32)
		.regex(/^[a-z0-9_]+$/),
	displayName: z.string().trim().max(80).optional().nullable(),
	bio: z.string().trim().max(240).optional().nullable(),
	contactEmail: z.string().trim().email().optional().nullable(),
	telegram: z.string().trim().max(64).optional().nullable(),
	max: z.string().trim().max(64).optional().nullable(),
	wechat: z.string().trim().max(64).optional().nullable(),
	twitter: z.string().trim().max(64).optional().nullable(),
	isPublic: z.boolean(),
});

function emptyToNull(value: string | null | undefined): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function createFallbackHandle(user: { id: string; email?: string | null }) {
	const emailPrefix = user.email?.split("@")[0] ?? "";
	const normalized = emailPrefix
		.toLowerCase()
		.replace(/[^a-z0-9_]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "");

	if (normalized.length >= 3) return normalized.slice(0, 32);
	return `rox_${user.id.replace(/-/g, "").slice(0, 12)}`;
}

function getLeagueTier(totalTokens: number) {
	if (totalTokens >= 10_000_000) {
		return {
			key: "legend",
			title: "Легенда Rox",
			description: "10M+ токенов за всё время",
		};
	}
	if (totalTokens >= 1_000_000) {
		return {
			key: "pro",
			title: "Профи",
			description: "1M+ токенов за всё время",
		};
	}
	if (totalTokens >= 100_000) {
		return {
			key: "builder",
			title: "Строитель",
			description: "100K+ токенов за всё время",
		};
	}
	return {
		key: "starter",
		title: "Новичок",
		description: "До 100K токенов за всё время",
	};
}

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

	profileUsage: protectedProcedure.query(async ({ ctx }) => {
		const userId = ctx.session.user.id;

		const [profile, usageRows, achievementRows] = await Promise.all([
			db.query.userProfiles.findFirst({
				where: eq(userProfiles.userId, userId),
			}),
			db
				.select()
				.from(usageDaily)
				.where(eq(usageDaily.userId, userId))
				.orderBy(desc(usageDaily.date))
				.limit(180),
			db
				.select({
					id: userAchievements.id,
					awardedAt: userAchievements.awardedAt,
					key: achievements.key,
					title: achievements.title,
					description: achievements.description,
					icon: achievements.icon,
					tier: achievements.tier,
				})
				.from(userAchievements)
				.innerJoin(
					achievements,
					eq(achievements.id, userAchievements.achievementId),
				)
				.where(eq(userAchievements.userId, userId))
				.orderBy(desc(userAchievements.awardedAt)),
		]);

		const totals = usageRows.reduce(
			(acc, row) => {
				acc.inputTokens += row.inputTokens;
				acc.outputTokens += row.outputTokens;
				acc.totalTokens += row.totalTokens;
				return acc;
			},
			{ inputTokens: 0, outputTokens: 0, totalTokens: 0 },
		);

		const dailyMap = new Map<
			string,
			{
				date: string;
				inputTokens: number;
				outputTokens: number;
				totalTokens: number;
			}
		>();
		const toolMap = new Map<string, { tool: string; totalTokens: number }>();

		for (const row of usageRows) {
			const date = String(row.date);
			const daily = dailyMap.get(date) ?? {
				date,
				inputTokens: 0,
				outputTokens: 0,
				totalTokens: 0,
			};
			daily.inputTokens += row.inputTokens;
			daily.outputTokens += row.outputTokens;
			daily.totalTokens += row.totalTokens;
			dailyMap.set(date, daily);

			const tool = toolMap.get(row.tool) ?? {
				tool: row.tool,
				totalTokens: 0,
			};
			tool.totalTokens += row.totalTokens;
			toolMap.set(row.tool, tool);
		}

		const sortedDailyUsage = [...dailyMap.values()]
			.sort((a, b) => a.date.localeCompare(b.date))
			.slice(-30);
		const toolUsage = [...toolMap.values()].sort(
			(a, b) => b.totalTokens - a.totalTokens,
		);

		return {
			profile: profile ?? {
				userId,
				handle: createFallbackHandle(ctx.session.user),
				displayName: ctx.session.user.name ?? null,
				bio: null,
				avatarUrl: ctx.session.user.image ?? null,
				isPublic: false,
				contactEmail: ctx.session.user.email ?? null,
				telegram: null,
				max: null,
				wechat: null,
				twitter: null,
			},
			totals,
			dailyUsage: sortedDailyUsage,
			toolUsage,
			leagueTier: getLeagueTier(totals.totalTokens),
			achievements: achievementRows,
		};
	}),

	updateUsageProfile: protectedProcedure
		.input(profileInputSchema)
		.mutation(async ({ ctx, input }) => {
			const values = {
				userId: ctx.session.user.id,
				handle: input.handle.toLowerCase(),
				displayName: emptyToNull(input.displayName),
				bio: emptyToNull(input.bio),
				avatarUrl: ctx.session.user.image ?? null,
				isPublic: input.isPublic,
				contactEmail: emptyToNull(input.contactEmail),
				telegram: emptyToNull(input.telegram),
				max: emptyToNull(input.max),
				wechat: emptyToNull(input.wechat),
				twitter: emptyToNull(input.twitter),
			};

			const [profile] = await db
				.insert(userProfiles)
				.values(values)
				.onConflictDoUpdate({
					target: userProfiles.userId,
					set: values,
				})
				.returning();

			return profile;
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
