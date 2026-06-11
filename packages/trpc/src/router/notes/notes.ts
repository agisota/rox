import { db } from "@rox/db/client";
import { profileNotes, userProfiles } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../../trpc";

const handleSchema = z
	.string()
	.min(2)
	.max(40)
	.regex(/^[a-zA-Z0-9_-]+$/);

export const notesRouter = {
	listPublic: publicProcedure
		.input(z.object({ handle: handleSchema }))
		.query(async ({ input }) => {
			const profile = await db.query.userProfiles.findFirst({
				where: and(
					eq(userProfiles.handle, input.handle),
					eq(userProfiles.isPublic, true),
				),
			});

			if (!profile) return [];

			return db.query.profileNotes.findMany({
				where: and(
					eq(profileNotes.userId, profile.userId),
					eq(profileNotes.isPublished, true),
				),
				orderBy: desc(profileNotes.createdAt),
			});
		}),

	listMine: protectedProcedure.query(async ({ ctx }) => {
		return db.query.profileNotes.findMany({
			where: eq(profileNotes.userId, ctx.session.user.id),
			orderBy: desc(profileNotes.createdAt),
		});
	}),

	create: protectedProcedure
		.input(z.object({ body: z.string().min(1).max(10_000) }))
		.mutation(async ({ ctx, input }) => {
			const [note] = await db
				.insert(profileNotes)
				.values({
					userId: ctx.session.user.id,
					body: input.body,
				})
				.returning();

			if (!note) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Не удалось создать заметку Rox.",
				});
			}

			return note;
		}),

	setPublished: protectedProcedure
		.input(z.object({ id: z.string().uuid(), isPublished: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const [note] = await db
				.update(profileNotes)
				.set({ isPublished: input.isPublished })
				.where(
					and(
						eq(profileNotes.id, input.id),
						eq(profileNotes.userId, ctx.session.user.id),
					),
				)
				.returning();

			if (!note) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Заметка Rox не найдена.",
				});
			}

			return note;
		}),
} satisfies TRPCRouterRecord;
