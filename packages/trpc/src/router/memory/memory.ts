import { db, dbWs } from "@rox/db/client";
import {
	memoryCategoryValues,
	memoryImportJobs,
	memoryItems,
} from "@rox/db/schema";
import { getCurrentTxid } from "@rox/db/utils";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { Client } from "@upstash/qstash";
import { put } from "@vercel/blob";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { parsePromptImport } from "./prompt-import";

const qstash = new Client({ token: env.QSTASH_TOKEN });

const categorySchema = z.enum(memoryCategoryValues);
const idInput = z.object({ id: z.string().uuid() });

/**
 * Run a write that targets one of the signed-in user's memory items, returning
 * the post-commit Electric txid. Throws NOT_FOUND when the item doesn't belong
 * to the caller, so a forged id can't touch another user's memory.
 */
async function mutateOwnedItem(
	apply: (
		tx: Parameters<Parameters<typeof dbWs.transaction>[0]>[0],
	) => Promise<{ id: string } | undefined>,
): Promise<{ txid: number }> {
	const result = await dbWs.transaction(async (tx) => {
		const row = await apply(tx);
		if (!row) return { txid: null };
		const txid = await getCurrentTxid(tx);
		return { txid };
	});
	if (result.txid === null) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Запись памяти не найдена.",
		});
	}
	return { txid: result.txid };
}

export const memoryRouter = {
	/** List the signed-in user's memory items, optionally filtered by group/status. */
	list: protectedProcedure
		.input(
			z
				.object({
					category: categorySchema.optional(),
					status: z.enum(["suggested", "approved", "dismissed"]).optional(),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [
				eq(memoryItems.organizationId, organizationId),
				eq(memoryItems.createdBy, ctx.session.user.id),
			];
			if (input?.category) {
				conditions.push(eq(memoryItems.category, input.category));
			}
			if (input?.status) conditions.push(eq(memoryItems.status, input.status));
			return db
				.select()
				.from(memoryItems)
				.where(and(...conditions))
				.orderBy(desc(memoryItems.createdAt));
		}),

	/** Create a manual memory item (approved on creation). */
	create: protectedProcedure
		.input(
			z.object({
				category: categorySchema,
				body: z.string().trim().min(1).max(4000),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const result = await dbWs.transaction(async (tx) => {
				const [item] = await tx
					.insert(memoryItems)
					.values({
						organizationId,
						createdBy: ctx.session.user.id,
						category: input.category,
						body: input.body,
						source: "manual",
						status: "approved",
					})
					.returning({ id: memoryItems.id });
				const txid = await getCurrentTxid(tx);
				return { id: item?.id, txid };
			});
			if (!result.id) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Не удалось создать запись памяти.",
				});
			}
			return result;
		}),

	/** Approve a suggested item (keeps it in its group). */
	approve: protectedProcedure
		.input(idInput)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return mutateOwnedItem(async (tx) => {
				const [row] = await tx
					.update(memoryItems)
					.set({ status: "approved" })
					.where(
						ownSuggestedItem(organizationId, ctx.session.user.id, input.id),
					)
					.returning({ id: memoryItems.id });
				return row;
			});
		}),

	/** Decline a suggested item (dismiss it). */
	decline: protectedProcedure
		.input(idInput)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return mutateOwnedItem(async (tx) => {
				const [row] = await tx
					.update(memoryItems)
					.set({ status: "dismissed" })
					.where(
						ownSuggestedItem(organizationId, ctx.session.user.id, input.id),
					)
					.returning({ id: memoryItems.id });
				return row;
			});
		}),

	/** Move an item to a different group. */
	updateGroup: protectedProcedure
		.input(idInput.extend({ category: categorySchema }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return mutateOwnedItem(async (tx) => {
				const [row] = await tx
					.update(memoryItems)
					.set({ category: input.category })
					.where(ownItem(organizationId, ctx.session.user.id, input.id))
					.returning({ id: memoryItems.id });
				return row;
			});
		}),

	/** Permanently delete an item. */
	remove: protectedProcedure.input(idInput).mutation(async ({ ctx, input }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return mutateOwnedItem(async (tx) => {
			const [row] = await tx
				.delete(memoryItems)
				.where(ownItem(organizationId, ctx.session.user.id, input.id))
				.returning({ id: memoryItems.id });
			return row;
		});
	}),

	/**
	 * Import memories pasted from another assistant's export-prompt dump. Parses
	 * the five export categories into Rox groups and inserts them as suggested
	 * (source=prompt), skipping bodies the user already has in that category.
	 */
	submitPromptImport: protectedProcedure
		.input(z.object({ text: z.string().trim().min(1).max(100_000) }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const parsed = parsePromptImport(input.text);
			if (parsed.length === 0) return { imported: 0 };

			const existing = await db
				.select({ body: memoryItems.body, category: memoryItems.category })
				.from(memoryItems)
				.where(
					and(
						eq(memoryItems.organizationId, organizationId),
						eq(memoryItems.createdBy, ctx.session.user.id),
					),
				);
			const seen = new Set(
				existing.map((e) => `${e.category}::${e.body.trim().toLowerCase()}`),
			);
			const fresh = parsed.filter(
				(p) => !seen.has(`${p.category}::${p.body.trim().toLowerCase()}`),
			);
			if (fresh.length === 0) return { imported: 0 };

			await db.insert(memoryItems).values(
				fresh.map((p) => ({
					organizationId,
					createdBy: ctx.session.user.id,
					category: p.category,
					body: p.body,
					source: "prompt" as const,
					status: "suggested" as const,
					sourceRef: { importedAt: new Date().toISOString() },
				})),
			);
			return { imported: fresh.length };
		}),

	/**
	 * Begin an archive import: store the export JSON on Vercel Blob, create a job
	 * row, and enqueue the async processor (parse → R1 classify → memory_items).
	 * Returns the jobId; progress is observed via the memoryImportJobs collection.
	 */
	startArchiveImport: protectedProcedure
		.input(
			z.object({
				provider: z.enum(["chatgpt", "anthropic"]),
				content: z.string().min(1).max(8_000_000),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [job] = await db
				.insert(memoryImportJobs)
				.values({
					organizationId,
					createdBy: ctx.session.user.id,
					provider: input.provider,
					status: "pending",
				})
				.returning({ id: memoryImportJobs.id });
			if (!job) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Не удалось создать задачу импорта.",
				});
			}

			const blob = await put(`memory-imports/${job.id}.json`, input.content, {
				access: "public",
				contentType: "application/json",
			});
			await db
				.update(memoryImportJobs)
				.set({ blobUrl: blob.url })
				.where(eq(memoryImportJobs.id, job.id));

			await qstash.publishJSON({
				url: `${env.NEXT_PUBLIC_API_URL}/api/memory/import/process`,
				body: { jobId: job.id },
				retries: 1,
			});
			return { jobId: job.id };
		}),
} satisfies TRPCRouterRecord;

function ownItem(organizationId: string, userId: string, id: string) {
	return and(
		eq(memoryItems.id, id),
		eq(memoryItems.organizationId, organizationId),
		eq(memoryItems.createdBy, userId),
	);
}

function ownSuggestedItem(organizationId: string, userId: string, id: string) {
	return and(
		ownItem(organizationId, userId, id),
		eq(memoryItems.status, "suggested"),
	);
}
