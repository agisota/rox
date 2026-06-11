import { db } from "@rox/db/client";
import { usageDaily, userProfiles, users } from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../../trpc";

const BILLION_DAILY_TOKENS = 1_000_000_000;
const rankingPeriodSchema = z.enum(["day", "week", "month", "all"]);

function getUtcDateDaysAgo(days: number): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() - days);
	return date.toISOString().slice(0, 10);
}

function getPeriodStart(
	period: z.infer<typeof rankingPeriodSchema>,
): string | null {
	if (period === "day") return getUtcDateDaysAgo(0);
	if (period === "week") return getUtcDateDaysAgo(6);
	if (period === "month") return getUtcDateDaysAgo(29);
	return null;
}

function getLeagueTier(maxDailyTokens: number): "billion" | "standard" {
	return maxDailyTokens >= BILLION_DAILY_TOKENS ? "billion" : "standard";
}

async function getRankings(period: z.infer<typeof rankingPeriodSchema>) {
	const periodStart = getPeriodStart(period);
	const rows = await db
		.select({
			userId: usageDaily.userId,
			date: usageDaily.date,
			totalTokens: usageDaily.totalTokens,
			handle: userProfiles.handle,
			displayName: userProfiles.displayName,
			avatarUrl: userProfiles.avatarUrl,
			userName: users.name,
			userImage: users.image,
		})
		.from(usageDaily)
		.innerJoin(
			userProfiles,
			and(
				eq(userProfiles.userId, usageDaily.userId),
				eq(userProfiles.isPublic, true),
			),
		)
		.innerJoin(users, eq(users.id, usageDaily.userId))
		.where(periodStart ? gte(usageDaily.date, periodStart) : undefined);

	const byUser = new Map<
		string,
		{
			userId: string;
			handle: string;
			displayName: string | null;
			avatarUrl: string | null;
			userName: string | null;
			userImage: string | null;
			totalTokens: number;
			dailyTotals: Map<string, number>;
		}
	>();

	for (const row of rows) {
		const entry = byUser.get(row.userId) ?? {
			userId: row.userId,
			handle: row.handle,
			displayName: row.displayName,
			avatarUrl: row.avatarUrl,
			userName: row.userName,
			userImage: row.userImage,
			totalTokens: 0,
			dailyTotals: new Map<string, number>(),
		};
		entry.totalTokens += row.totalTokens;
		entry.dailyTotals.set(
			row.date,
			(entry.dailyTotals.get(row.date) ?? 0) + row.totalTokens,
		);
		byUser.set(row.userId, entry);
	}

	return [...byUser.values()]
		.map((entry) => {
			const maxDailyTokens = Math.max(0, ...entry.dailyTotals.values());
			return {
				userId: entry.userId,
				handle: entry.handle,
				displayName: entry.displayName ?? entry.userName,
				avatarUrl: entry.avatarUrl ?? entry.userImage,
				totalTokens: entry.totalTokens,
				leagueTier: getLeagueTier(maxDailyTokens),
			};
		})
		.sort((a, b) => b.totalTokens - a.totalTokens)
		.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export const rankingRouter = {
	leaderboard: publicProcedure
		.input(
			z
				.object({
					period: rankingPeriodSchema.default("day"),
					limit: z.number().int().min(1).max(100).default(50),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			const rankings = await getRankings(input?.period ?? "day");
			return rankings.slice(0, input?.limit ?? 50);
		}),

	myRank: protectedProcedure
		.input(z.object({ period: rankingPeriodSchema.default("day") }).optional())
		.query(async ({ ctx, input }) => {
			const rankings = await getRankings(input?.period ?? "day");
			return (
				rankings.find((entry) => entry.userId === ctx.session.user.id) ?? null
			);
		}),
} satisfies TRPCRouterRecord;
