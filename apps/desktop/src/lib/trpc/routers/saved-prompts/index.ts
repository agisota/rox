import { type SelectSavedPrompt, savedPrompts } from "@rox/local-db";
import { eq, sql } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { backfillSavedPromptMetadata } from "./backfill";

/**
 * Saved prompts CRUD over local SQLite. Backs the "Сохранённые промпты"
 * sidebar view: a local library of reusable prompt snippets the user can
 * create, edit, delete, organize into folders, tag, favorite, reorder, and
 * copy back into a chat composer. Purely local — nothing is synced to the
 * cloud.
 *
 * Metadata (tags / favorite / usage) and ordering live in real schema columns
 * (`folder`, `tags`, `is_favorite`, `copy_count`, `last_used_at`, `position`).
 * Historically these were smuggled into the `body` column as a hidden
 * `<!--rox:meta {...} -->` HTML comment; `list` runs a one-time idempotent
 * backfill that migrates any surviving blocks into the columns and cleans the
 * `body`, so older installs upgrade transparently.
 */

const tagsSchema = z
	.array(z.string())
	.transform((tags) => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const raw of tags) {
			const tag = raw.trim().replace(/\s+/g, " ");
			if (tag.length === 0) continue;
			const key = tag.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(tag);
		}
		return out;
	})
	.optional();

const folderSchema = z
	.string()
	.trim()
	.max(120)
	.nullish()
	.transform((value) => {
		if (value === undefined || value === null) return value ?? null;
		return value.length === 0 ? null : value;
	});

function nextPosition(): number {
	const [row] = localDb
		.select({ max: sql<number | null>`max(${savedPrompts.position})` })
		.from(savedPrompts)
		.all();
	return (row?.max ?? -1) + 1;
}

export const createSavedPromptsRouter = () => {
	return router({
		list: publicProcedure.query((): SelectSavedPrompt[] => {
			backfillSavedPromptMetadata(localDb);
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
					folder: folderSchema,
					tags: tagsSchema,
					isFavorite: z.boolean().optional(),
				}),
			)
			.mutation(({ input }) => {
				const now = Date.now();
				const [created] = localDb
					.insert(savedPrompts)
					.values({
						title: input.title,
						body: input.body,
						folder: input.folder ?? null,
						tags: input.tags ?? [],
						isFavorite: input.isFavorite ?? false,
						copyCount: 0,
						position: nextPosition(),
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
					folder: folderSchema,
					tags: tagsSchema,
					isFavorite: z.boolean().optional(),
				}),
			)
			.mutation(({ input }) => {
				const patch: Partial<typeof savedPrompts.$inferInsert> = {
					title: input.title,
					body: input.body,
					updatedAt: Date.now(),
				};
				if (input.folder !== undefined) patch.folder = input.folder;
				if (input.tags !== undefined) patch.tags = input.tags;
				if (input.isFavorite !== undefined) patch.isFavorite = input.isFavorite;

				const [updated] = localDb
					.update(savedPrompts)
					.set(patch)
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

		/**
		 * Persist a drag-reordered layout. Accepts the full ordered id list and
		 * writes a dense 0..n `position` for each, so the order survives restarts.
		 */
		reorder: publicProcedure
			.input(z.object({ orderedIds: z.array(z.string()) }))
			.mutation(({ input }) => {
				const now = Date.now();
				localDb.transaction((tx) => {
					input.orderedIds.forEach((id, index) => {
						tx.update(savedPrompts)
							.set({ position: index, updatedAt: now })
							.where(eq(savedPrompts.id, id))
							.run();
					});
				});
				return { count: input.orderedIds.length };
			}),

		/** Bump usage on insert/copy: increments `copy_count`, stamps last use. */
		incrementCopy: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const [updated] = localDb
					.update(savedPrompts)
					.set({
						copyCount: sql`${savedPrompts.copyCount} + 1`,
						lastUsedAt: Date.now(),
					})
					.where(eq(savedPrompts.id, input.id))
					.returning()
					.all();
				return updated ?? null;
			}),
	});
};
