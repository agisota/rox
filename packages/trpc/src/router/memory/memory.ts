import { db, dbWs } from "@rox/db/client";
import { memoryCategoryValues, memoryItems } from "@rox/db/schema";
import { getCurrentTxid } from "@rox/db/utils";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";

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
					.where(ownItem(organizationId, ctx.session.user.id, input.id))
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
					.where(ownItem(organizationId, ctx.session.user.id, input.id))
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
} satisfies TRPCRouterRecord;

function ownItem(organizationId: string, userId: string, id: string) {
	return and(
		eq(memoryItems.id, id),
		eq(memoryItems.organizationId, organizationId),
		eq(memoryItems.createdBy, userId),
	);
}
