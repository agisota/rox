import { db } from "@rox/db/client";
import { achievements, userAchievements, userProfiles } from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure } from "../../trpc";

const handleSchema = z
	.string()
	.min(2)
	.max(40)
	.regex(/^[a-zA-Z0-9_-]+$/);

export const achievementsRouter = {
	forUser: publicProcedure
		.input(z.object({ handle: handleSchema }))
		.query(async ({ input }) => {
			const profile = await db.query.userProfiles.findFirst({
				where: and(
					eq(userProfiles.handle, input.handle),
					eq(userProfiles.isPublic, true),
				),
				columns: { userId: true },
			});

			if (!profile) return [];

			return db
				.select({
					id: achievements.id,
					key: achievements.key,
					title: achievements.title,
					description: achievements.description,
					icon: achievements.icon,
					tier: achievements.tier,
					awardedAt: userAchievements.awardedAt,
				})
				.from(userAchievements)
				.innerJoin(
					achievements,
					eq(achievements.id, userAchievements.achievementId),
				)
				.where(eq(userAchievements.userId, profile.userId))
				.orderBy(desc(userAchievements.awardedAt));
		}),
} satisfies TRPCRouterRecord;
