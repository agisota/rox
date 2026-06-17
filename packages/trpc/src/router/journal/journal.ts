import { db } from "@rox/db/client";
import { journalEntries } from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { Client } from "@upstash/qstash";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";

const qstash = new Client({ token: env.QSTASH_TOKEN });

const dayInput = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "day must be YYYY-MM-DD");

export const journalRouter = {
	/**
	 * List the signed-in user's journal entries, newest day first, keyed by a
	 * `day` cursor (entries strictly before the cursor). Desktop reads via the
	 * Electric collection; this is the web/fallback + server-pagination path.
	 */
	list: protectedProcedure
		.input(
			z
				.object({
					cursor: dayInput.optional(),
					limit: z.number().int().min(1).max(90).default(30),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const limit = input?.limit ?? 30;
			const conditions = [
				eq(journalEntries.organizationId, organizationId),
				eq(journalEntries.createdBy, ctx.session.user.id),
			];
			if (input?.cursor) conditions.push(lt(journalEntries.day, input.cursor));

			const rows = await db
				.select()
				.from(journalEntries)
				.where(and(...conditions))
				.orderBy(desc(journalEntries.day))
				.limit(limit);

			const nextCursor =
				rows.length === limit ? rows[rows.length - 1]?.day : undefined;
			return { entries: rows, nextCursor };
		}),

	/**
	 * Queue a (re)generation of one day's journal entry for the signed-in user.
	 * Enqueues the same per-user QStash job the daily cron uses; the upsert makes
	 * regeneration idempotent. Returns immediately — the Electric collection
	 * reflects the new row once the job completes.
	 */
	regenerateDay: protectedProcedure
		.input(z.object({ day: dayInput }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await qstash.publishJSON({
				url: `${env.NEXT_PUBLIC_API_URL}/api/journal/generate/user`,
				body: {
					organizationId,
					userId: ctx.session.user.id,
					day: input.day,
				},
				retries: 1,
			});
			return { queued: true as const, day: input.day };
		}),
} satisfies TRPCRouterRecord;
