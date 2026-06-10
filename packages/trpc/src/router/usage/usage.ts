import { db } from "@rox/db/client";
import { usageDaily, userProfiles } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../../trpc";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const usageRowInputSchema = z.object({
	date: dateSchema,
	tool: z.string().min(1).max(120),
	model: z.string().min(1).max(160),
	inputTokens: z.number().int().nonnegative().default(0),
	outputTokens: z.number().int().nonnegative().default(0),
	totalTokens: z.number().int().nonnegative().optional(),
});

function getUtcDateDaysAgo(days: number): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() - days);
	return date.toISOString().slice(0, 10);
}

async function assertCanReadUsage(
	userId: string,
	viewerId: string | undefined,
) {
	if (userId === viewerId) return;

	const profile = await db.query.userProfiles.findFirst({
		where: eq(userProfiles.userId, userId),
		columns: { isPublic: true },
	});

	if (!profile?.isPublic) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Этот профиль Rox закрыт.",
		});
	}
}

export const usageRouter = {
	summary: publicProcedure
		.input(z.object({ userId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await assertCanReadUsage(input.userId, ctx.session?.user.id);

			const rows = await db.query.usageDaily.findMany({
				where: eq(usageDaily.userId, input.userId),
			});

			const last30Start = getUtcDateDaysAgo(29);
			const perTool = new Map<
				string,
				{
					tool: string;
					inputTokens: number;
					outputTokens: number;
					totalTokens: number;
				}
			>();
			const daily = new Map<
				string,
				{
					date: string;
					inputTokens: number;
					outputTokens: number;
					totalTokens: number;
				}
			>();
			const totals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

			for (const row of rows) {
				totals.inputTokens += row.inputTokens;
				totals.outputTokens += row.outputTokens;
				totals.totalTokens += row.totalTokens;

				const tool = perTool.get(row.tool) ?? {
					tool: row.tool,
					inputTokens: 0,
					outputTokens: 0,
					totalTokens: 0,
				};
				tool.inputTokens += row.inputTokens;
				tool.outputTokens += row.outputTokens;
				tool.totalTokens += row.totalTokens;
				perTool.set(row.tool, tool);

				if (row.date >= last30Start) {
					const day = daily.get(row.date) ?? {
						date: row.date,
						inputTokens: 0,
						outputTokens: 0,
						totalTokens: 0,
					};
					day.inputTokens += row.inputTokens;
					day.outputTokens += row.outputTokens;
					day.totalTokens += row.totalTokens;
					daily.set(row.date, day);
				}
			}

			return {
				totals,
				perTool: [...perTool.values()].sort(
					(a, b) => b.totalTokens - a.totalTokens,
				),
				daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
			};
		}),

	recordBatch: protectedProcedure
		.input(z.object({ rows: z.array(usageRowInputSchema).min(1).max(500) }))
		.mutation(async ({ ctx, input }) => {
			const rows = input.rows.map((row) => {
				const totalTokens =
					row.totalTokens ?? row.inputTokens + row.outputTokens;
				return {
					userId: ctx.session.user.id,
					date: row.date,
					tool: row.tool,
					model: row.model,
					inputTokens: row.inputTokens,
					outputTokens: row.outputTokens,
					totalTokens,
				};
			});

			await db
				.insert(usageDaily)
				.values(rows)
				.onConflictDoUpdate({
					target: [
						usageDaily.userId,
						usageDaily.tool,
						usageDaily.model,
						usageDaily.date,
					],
					set: {
						inputTokens: sql`${usageDaily.inputTokens} + excluded.input_tokens`,
						outputTokens: sql`${usageDaily.outputTokens} + excluded.output_tokens`,
						totalTokens: sql`${usageDaily.totalTokens} + excluded.total_tokens`,
					},
				});

			return { success: true, count: rows.length };
		}),
} satisfies TRPCRouterRecord;
