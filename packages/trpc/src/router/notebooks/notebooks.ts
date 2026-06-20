import { randomBytes } from "node:crypto";
import { db } from "@rox/db/client";
import { noteNotebooks, noteNotes } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { protectedProcedure, publicProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	createNotebookSchema,
	createNoteSchema,
	getPublicNoteSchema,
	listNotebooksSchema,
	listNotesSchema,
	notebookIdSchema,
	noteIdSchema,
	setNotePublishedSchema,
	updateNotebookSchema,
	updateNoteSchema,
} from "./schema";

/**
 * Notes (D7) router — Workspace Suite P2.
 *
 * Org-scoped AND per-user: every read/write is constrained by both the active
 * organization (`requireActiveOrgMembership`, the skill-router pattern) and the
 * caller's user id, so a member only ever sees their own notebooks/notes within
 * the org. Notes denormalize `organization_id` + `owner_user_id` on write,
 * resolving both from the verified parent notebook (never from raw input),
 * matching the dashboard router's parent→child denormalization contract.
 *
 * Public sharing reuses the per-row slug convention: `setPublished` mints a
 * unique `public_slug` the first time a note is published, and `getPublic`
 * serves it unauthenticated. The collaborative live-editing layer (LiveBlocks,
 * room `org:{orgId}:note:{noteId}`) mounts ON these durable rows client-side and
 * is gated by the existing `collab.authRoom` ACL — it never owns content.
 */

const DEFAULT_SHARE_ORIGIN = "https://app.rox.one";

export function getPublicNoteUrl(slug: string): string {
	const origin = (
		process.env.SHARE_ORIGIN ??
		process.env.NEXT_PUBLIC_SHARE_ORIGIN ??
		DEFAULT_SHARE_ORIGIN
	).replace(/\/+$/, "");
	// Dedicated `/s/note/<slug>` namespace, kept separate from the `publicShares`
	// slugs served at `/s/<slug>` (the two slug spaces are minted independently and
	// could otherwise collide on the same path).
	return `${origin}/s/note/${slug}`;
}

function createNoteSlug(): string {
	return randomBytes(9).toString("base64url");
}

async function getNotebookForUser(
	organizationId: string,
	ownerUserId: string,
	notebookId: string,
) {
	const [row] = await db
		.select()
		.from(noteNotebooks)
		.where(
			and(
				eq(noteNotebooks.id, notebookId),
				eq(noteNotebooks.organizationId, organizationId),
				eq(noteNotebooks.ownerUserId, ownerUserId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Notebook not found" });
	}
	return row;
}

async function getNoteForUser(
	organizationId: string,
	ownerUserId: string,
	noteId: string,
) {
	const [row] = await db
		.select()
		.from(noteNotes)
		.where(
			and(
				eq(noteNotes.id, noteId),
				eq(noteNotes.organizationId, organizationId),
				eq(noteNotes.ownerUserId, ownerUserId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
	}
	return row;
}

export const notebooksRouter = {
	// --- notebooks -----------------------------------------------------------

	listNotebooks: protectedProcedure
		.input(listNotebooksSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [
				eq(noteNotebooks.organizationId, organizationId),
				eq(noteNotebooks.ownerUserId, ctx.session.user.id),
			];
			if (input?.v2ProjectId) {
				conditions.push(eq(noteNotebooks.v2ProjectId, input.v2ProjectId));
			}
			return db
				.select()
				.from(noteNotebooks)
				.where(and(...conditions))
				.orderBy(asc(noteNotebooks.position), desc(noteNotebooks.updatedAt));
		}),

	createNotebook: protectedProcedure
		.input(createNotebookSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [row] = await db
				.insert(noteNotebooks)
				.values({
					organizationId,
					ownerUserId: ctx.session.user.id,
					v2ProjectId: input.v2ProjectId ?? null,
					name: input.name,
					icon: input.icon ?? null,
					position: input.position ?? 0,
				})
				.returning();
			return row;
		}),

	updateNotebook: protectedProcedure
		.input(updateNotebookSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getNotebookForUser(
				organizationId,
				ctx.session.user.id,
				input.notebookId,
			);
			const [row] = await db
				.update(noteNotebooks)
				.set({
					...(input.name !== undefined ? { name: input.name } : {}),
					...(input.icon !== undefined ? { icon: input.icon } : {}),
					...(input.position !== undefined ? { position: input.position } : {}),
				})
				.where(
					and(
						eq(noteNotebooks.id, input.notebookId),
						eq(noteNotebooks.organizationId, organizationId),
						eq(noteNotebooks.ownerUserId, ctx.session.user.id),
					),
				)
				.returning();
			return row;
		}),

	deleteNotebook: protectedProcedure
		.input(notebookIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getNotebookForUser(
				organizationId,
				ctx.session.user.id,
				input.notebookId,
			);
			await db
				.delete(noteNotebooks)
				.where(
					and(
						eq(noteNotebooks.id, input.notebookId),
						eq(noteNotebooks.organizationId, organizationId),
						eq(noteNotebooks.ownerUserId, ctx.session.user.id),
					),
				);
			return { ok: true as const };
		}),

	// --- notes ---------------------------------------------------------------

	listNotes: protectedProcedure
		.input(listNotesSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [
				eq(noteNotes.organizationId, organizationId),
				eq(noteNotes.ownerUserId, ctx.session.user.id),
			];
			if (input.notebookId) {
				conditions.push(eq(noteNotes.notebookId, input.notebookId));
			}
			// Explicit projection that EXCLUDES the (up to 500k) `markdown` column:
			// the list view never renders note bodies, and shipping every note's full
			// markdown to the client cache on each notebook switch/refetch is wasteful.
			// `updatedAt` ties are broken by `id` so same-batch notes keep a stable
			// order (avoids list flicker); capped at 200 rows per list.
			const rows = await db
				.select({
					id: noteNotes.id,
					notebookId: noteNotes.notebookId,
					title: noteNotes.title,
					tags: noteNotes.tags,
					isPublished: noteNotes.isPublished,
					publicSlug: noteNotes.publicSlug,
					knowledgeDocumentId: noteNotes.knowledgeDocumentId,
					createdAt: noteNotes.createdAt,
					updatedAt: noteNotes.updatedAt,
				})
				.from(noteNotes)
				.where(and(...conditions))
				.orderBy(desc(noteNotes.updatedAt), desc(noteNotes.id))
				.limit(200);

			// Tag filter is applied in-memory: tags are a jsonb array and the lists
			// are per-user (small), so a portable client-side `every` match keeps the
			// query simple and avoids a dialect-specific containment operator.
			const wanted = input.tags;
			if (!wanted || wanted.length === 0) return rows;
			return rows.filter((note) => {
				const tags = (note.tags ?? []) as string[];
				return wanted.every((tag) => tags.includes(tag));
			});
		}),

	getNote: protectedProcedure
		.input(noteIdSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const note = await getNoteForUser(
				organizationId,
				ctx.session.user.id,
				input.noteId,
			);
			return {
				...note,
				publicUrl: note.publicSlug ? getPublicNoteUrl(note.publicSlug) : null,
			};
		}),

	createNote: protectedProcedure
		.input(createNoteSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			// Resolve org + owner from the verified parent notebook, not raw input.
			const notebook = await getNotebookForUser(
				organizationId,
				ctx.session.user.id,
				input.notebookId,
			);
			const [row] = await db
				.insert(noteNotes)
				.values({
					notebookId: notebook.id,
					organizationId: notebook.organizationId,
					ownerUserId: notebook.ownerUserId,
					title: input.title,
					markdown: input.markdown ?? "",
					tags: input.tags ?? [],
					knowledgeDocumentId: input.knowledgeDocumentId ?? null,
				})
				.returning();
			return row;
		}),

	updateNote: protectedProcedure
		.input(updateNoteSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getNoteForUser(organizationId, ctx.session.user.id, input.noteId);
			const [row] = await db
				.update(noteNotes)
				.set({
					...(input.title !== undefined ? { title: input.title } : {}),
					...(input.markdown !== undefined ? { markdown: input.markdown } : {}),
					...(input.tags !== undefined ? { tags: input.tags } : {}),
					...(input.knowledgeDocumentId !== undefined
						? { knowledgeDocumentId: input.knowledgeDocumentId }
						: {}),
				})
				.where(
					and(
						eq(noteNotes.id, input.noteId),
						eq(noteNotes.organizationId, organizationId),
						eq(noteNotes.ownerUserId, ctx.session.user.id),
					),
				)
				.returning();
			return row;
		}),

	deleteNote: protectedProcedure
		.input(noteIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getNoteForUser(organizationId, ctx.session.user.id, input.noteId);
			await db
				.delete(noteNotes)
				.where(
					and(
						eq(noteNotes.id, input.noteId),
						eq(noteNotes.organizationId, organizationId),
						eq(noteNotes.ownerUserId, ctx.session.user.id),
					),
				);
			return { ok: true as const };
		}),

	/**
	 * Publish or unpublish a note. Publishing mints a stable `public_slug` the
	 * first time (kept on subsequent unpublish/publish cycles so the link is
	 * durable); unpublishing flips the flag but retains the slug.
	 */
	setPublished: protectedProcedure
		.input(setNotePublishedSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const note = await getNoteForUser(
				organizationId,
				ctx.session.user.id,
				input.noteId,
			);

			const slug =
				note.publicSlug ?? (input.isPublished ? createNoteSlug() : null);

			const [row] = await db
				.update(noteNotes)
				.set({ isPublished: input.isPublished, publicSlug: slug })
				.where(
					and(
						eq(noteNotes.id, input.noteId),
						eq(noteNotes.organizationId, organizationId),
						eq(noteNotes.ownerUserId, ctx.session.user.id),
					),
				)
				.returning();

			if (!row) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update note publish state",
				});
			}

			return {
				...row,
				publicUrl: row.publicSlug ? getPublicNoteUrl(row.publicSlug) : null,
			};
		}),

	/**
	 * Read a published note by its public slug — unauthenticated. Returns only
	 * the presentation fields; never the owner/org ids.
	 */
	getPublic: publicProcedure
		.input(getPublicNoteSchema)
		.query(async ({ input }) => {
			const [note] = await db
				.select({
					id: noteNotes.id,
					title: noteNotes.title,
					markdown: noteNotes.markdown,
					tags: noteNotes.tags,
					createdAt: noteNotes.createdAt,
					updatedAt: noteNotes.updatedAt,
				})
				.from(noteNotes)
				.where(
					and(
						eq(noteNotes.publicSlug, input.slug),
						eq(noteNotes.isPublished, true),
					),
				)
				.limit(1);

			if (!note) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Published note not found",
				});
			}

			return { ...note, url: getPublicNoteUrl(input.slug) };
		}),
} satisfies TRPCRouterRecord;
