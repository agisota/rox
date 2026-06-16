import { savedPrompts } from "@rox/local-db";
import { eq, sql } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Saved prompts CRUD over local SQLite. Backs the "Сохранённые промпты"
 * sidebar view: a local library of reusable prompt snippets the user can
 * create, edit, delete, and copy back into a chat composer. Purely local —
 * nothing is synced to the cloud.
 */
export const createSavedPromptsRouter = () => {
	return router({
		list: publicProcedure.query(() => {
			return localDb
				.select()
				.from(savedPrompts)
				.orderBy(sql`${savedPrompts.updatedAt} desc`)
				.all();
		}),

		create: publicProcedure
			.input(
				z.object({
					title: z.string().trim().min(1).max(200),
					body: z.string().min(1),
				}),
			)
			.mutation(({ input }) => {
				const now = Date.now();
				const [created] = localDb
					.insert(savedPrompts)
					.values({
						title: input.title,
						body: input.body,
						createdAt: now,
						updatedAt: now,
					})
					.returning()
					.all();
				return created;
			}),

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					title: z.string().trim().min(1).max(200),
					body: z.string().min(1),
				}),
			)
			.mutation(({ input }) => {
				const [updated] = localDb
					.update(savedPrompts)
					.set({
						title: input.title,
						body: input.body,
						updatedAt: Date.now(),
					})
					.where(eq(savedPrompts.id, input.id))
					.returning()
					.all();
				return updated ?? null;
			}),

		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				localDb.delete(savedPrompts).where(eq(savedPrompts.id, input.id)).run();
				return { id: input.id };
			}),
	});
};
