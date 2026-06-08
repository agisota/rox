import { db } from "@rox/db/client";
import { organizations, sessions, users } from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { count, gt, gte } from "drizzle-orm";

import { adminProcedure } from "../../trpc";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const adminStatsRouter = {
	/** Key platform stats for the admin dashboard home. */
	getStats: adminProcedure.query(async () => {
		const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);
		const now = new Date();

		const [totalUsers, totalOrganizations, recentSignups, activeSessions] =
			await Promise.all([
				db.select({ value: count() }).from(users),
				db.select({ value: count() }).from(organizations),
				db
					.select({ value: count() })
					.from(users)
					.where(gte(users.createdAt, sevenDaysAgo)),
				db
					.select({ value: count() })
					.from(sessions)
					.where(gt(sessions.expiresAt, now)),
			]);

		return {
			totalUsers: totalUsers[0]?.value ?? 0,
			totalOrganizations: totalOrganizations[0]?.value ?? 0,
			recentSignups: recentSignups[0]?.value ?? 0,
			activeSessions: activeSessions[0]?.value ?? 0,
		};
	}),
} satisfies TRPCRouterRecord;
