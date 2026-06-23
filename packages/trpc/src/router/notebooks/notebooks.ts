import { randomBytes } from "node:crypto";
import { db, dbWs } from "@rox/db/client";
import {
	knowledgeDocuments,
	noteBookItems,
	noteNotebooks,
	noteNotes,
} from "@rox/db/schema";
import { assertMdxSafe, MdxSecurityError } from "@rox/shared/knowledge";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import { env } from "../../env";
import { protectedProcedure, publicProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { createNoteDocument, updateNoteDocument } from "./notes-storage";
import {
	addNoteToNotebookSchema,
	createNotebookSchema,
	createNoteSchema,
	getPublicNoteSchema,
	listNotebooksSchema,
	listNotesSchema,
	notebookIdSchema,
	noteIdSchema,
	removeNoteFromNotebookSchema,
	reorderNotebookItemsSchema,
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

/**
 * Reject unsafe MDX before it can ever be persisted + served on the anonymous
 * `/s/note/<slug>` page (N5). Reuses the shared knowledge guard (the same one the
 * knowledge router applies at its trust boundary) and surfaces a clean
 * `BAD_REQUEST` to the client instead of an opaque 500.
 */
function assertNoteMarkdownSafe(markdown: string | null | undefined): void {
	if (!markdown) return;
	try {
		assertMdxSafe(markdown);
	} catch (error) {
		if (error instanceof MdxSecurityError) {
			throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
		}
		throw error;
	}
}

// Per-user publish rate limit (N5): publishing exposes content on an anonymous
// URL, so cap how fast a single user can mint/flip public notes to blunt abuse.
// Mirrors the support router's house pattern (KV-backed, no-op-with-warning in
// non-prod when KV is unconfigured, hard-fail in prod).
const setPublishedRateLimit =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Ratelimit({
				redis: new Redis({
					url: env.KV_REST_API_URL,
					token: env.KV_REST_API_TOKEN,
				}),
				limiter: Ratelimit.slidingWindow(20, "1 h"),
				prefix: "ratelimit:notes:set-published",
			})
		: null;

async function assertSetPublishedRateLimit(userId: string): Promise<void> {
	if (!setPublishedRateLimit) {
		if (env.NODE_ENV === "production") {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Note publish rate limiting is not configured",
			});
		}
		console.warn(
			"[notebooks/setPublished] rate limit skipped because KV is not configured",
		);
		return;
	}
	let success = true;
	try {
		({ success } = await setPublishedRateLimit.limit(userId));
	} catch (error) {
		// A KV outage / misconfiguration (e.g. the placeholder REST URL that passes
		// env validation in CI) must not block publishing: fail OPEN in non-prod,
		// surface it in prod.
		if (env.NODE_ENV === "production") throw error;
		console.warn(
			"[notebooks/setPublished] rate limit skipped — KV unavailable:",
			error instanceof Error ? error.message : error,
		);
		return;
	}
	if (!success) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "Too many note publish changes. Try again later.",
		});
	}
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

/**
 * Membership edges (note_book_items) address the note by its backing
 * `knowledge_documents.id`. The edge table carries `organization_id` but no
 * per-user owner, so the org boundary is the right scope for the document
 * itself: confirm the doc exists AND lives in the caller's active org before an
 * edge is created (cross-org docs must never be silently linked). Throws
 * NOT_FOUND when the doc is missing or belongs to another org.
 */
async function assertDocInOrg(
	organizationId: string,
	documentId: string,
): Promise<void> {
	const [row] = await db
		.select({ id: knowledgeDocuments.id })
		.from(knowledgeDocuments)
		.where(
			and(
				eq(knowledgeDocuments.id, documentId),
				eq(knowledgeDocuments.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
	}
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

/**
 * Resolve the authoritative content (title/markdown/tags) for a note row.
 *
 * Since N2 the system of record is the backing `knowledge_documents` row, so
 * doc-linked notes read their content from there. Legacy / not-yet-backfilled
 * notes (null `knowledge_document_id`, or a doc that was detached) transparently
 * fall back to the inline `note_notes` columns, keeping every existing note
 * readable through the unchanged public API.
 */
async function resolveNoteContent(
	note: typeof noteNotes.$inferSelect,
): Promise<{
	title: string;
	markdown: string;
	tags: string[];
}> {
	if (note.knowledgeDocumentId) {
		const [doc] = await db
			.select({
				title: knowledgeDocuments.title,
				markdown: knowledgeDocuments.markdown,
				tags: knowledgeDocuments.tags,
			})
			.from(knowledgeDocuments)
			.where(eq(knowledgeDocuments.id, note.knowledgeDocumentId))
			.limit(1);
		if (doc) {
			return {
				title: doc.title,
				markdown: doc.markdown ?? "",
				tags: (doc.tags ?? []) as string[],
			};
		}
	}
	return {
		title: note.title,
		markdown: note.markdown ?? "",
		tags: (note.tags ?? []) as string[],
	};
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

			// N2: the backing `knowledge_documents` row is the system of record for a
			// note's title/tags, but this list path reads the thin `note_notes` mirror,
			// which a knowledge-router edit does NOT keep in sync. Overlay the
			// authoritative title/tags from the backing docs in a SINGLE batched fetch
			// keyed by `knowledge_document_id`, so the list shows the current values
			// without going stale. `markdown` is deliberately still EXCLUDED — the list
			// path must stay lightweight. Legacy / detached rows (null doc id, or a doc
			// that was removed) transparently keep their inline mirror values.
			const docIds = [
				...new Set(
					rows
						.map((r) => r.knowledgeDocumentId)
						.filter((id): id is string => id != null),
				),
			];
			let resolved = rows;
			if (docIds.length > 0) {
				const docs = await db
					.select({
						id: knowledgeDocuments.id,
						title: knowledgeDocuments.title,
						tags: knowledgeDocuments.tags,
					})
					.from(knowledgeDocuments)
					.where(inArray(knowledgeDocuments.id, docIds));
				const byId = new Map(docs.map((d) => [d.id, d]));
				resolved = rows.map((r) => {
					const doc = r.knowledgeDocumentId
						? byId.get(r.knowledgeDocumentId)
						: undefined;
					return doc
						? { ...r, title: doc.title, tags: (doc.tags ?? []) as string[] }
						: r;
				});
			}

			// Tag filter is applied in-memory: tags are a jsonb array and the lists
			// are per-user (small), so a portable client-side `every` match keeps the
			// query simple and avoids a dialect-specific containment operator. Filter
			// the RESOLVED tags so a doc-router tag edit is reflected in the filter too.
			const wanted = input.tags;
			if (!wanted || wanted.length === 0) return resolved;
			return resolved.filter((note) => {
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
			// Content reads from the backing doc (system of record), so an edit made
			// through the knowledge router is reflected here too.
			const content = await resolveNoteContent(note);
			return {
				...note,
				...content,
				publicUrl: note.publicSlug ? getPublicNoteUrl(note.publicSlug) : null,
			};
		}),

	createNote: protectedProcedure
		.input(createNoteSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			assertNoteMarkdownSafe(input.markdown);
			// Resolve org + owner from the verified parent notebook, not raw input.
			const notebook = await getNotebookForUser(
				organizationId,
				ctx.session.user.id,
				input.notebookId,
			);

			// N2: a note's content is a knowledge_documents row (type='note'). The
			// backing doc, the note INDEX row, and the notebook membership edge all
			// commit atomically so a partial failure never leaves a dangling note.
			const markdown = input.markdown ?? "";
			const tags = input.tags ?? [];
			return dbWs.transaction(async (tx) => {
				const doc = await createNoteDocument(tx, {
					organizationId: notebook.organizationId,
					createdByUserId: notebook.ownerUserId,
					title: input.title,
					markdown,
					tags,
					v2ProjectId: notebook.v2ProjectId,
				});
				const [row] = await tx
					.insert(noteNotes)
					.values({
						notebookId: notebook.id,
						organizationId: notebook.organizationId,
						ownerUserId: notebook.ownerUserId,
						title: input.title,
						markdown,
						tags,
						// Always carry the backing doc; an explicit input id (used to
						// adopt an existing doc) takes precedence over the freshly minted one.
						knowledgeDocumentId: input.knowledgeDocumentId ?? doc.id,
					})
					.returning();
				if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

				await tx.insert(noteBookItems).values({
					organizationId: notebook.organizationId,
					noteBookId: notebook.id,
					documentId: row.knowledgeDocumentId ?? doc.id,
					addedBy: notebook.ownerUserId,
				});
				return row;
			});
		}),

	updateNote: protectedProcedure
		.input(updateNoteSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const note = await getNoteForUser(
				organizationId,
				ctx.session.user.id,
				input.noteId,
			);
			if (input.markdown !== undefined) assertNoteMarkdownSafe(input.markdown);

			// N2: content lands in the backing knowledge_documents row (which also
			// re-syncs backlinks via the knowledge engine). The note INDEX row keeps
			// a mirror of title/markdown/tags so the lightweight list path and legacy
			// readers stay correct without a join.
			const targetDocId = input.knowledgeDocumentId ?? note.knowledgeDocumentId;
			return dbWs.transaction(async (tx) => {
				if (
					targetDocId &&
					(input.title !== undefined ||
						input.markdown !== undefined ||
						input.tags !== undefined)
				) {
					await updateNoteDocument(tx, {
						organizationId,
						documentId: targetDocId,
						title: input.title,
						markdown: input.markdown,
						tags: input.tags,
					});
				}

				const [row] = await tx
					.update(noteNotes)
					.set({
						...(input.title !== undefined ? { title: input.title } : {}),
						...(input.markdown !== undefined
							? { markdown: input.markdown }
							: {}),
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
			});
		}),

	deleteNote: protectedProcedure
		.input(noteIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const note = await getNoteForUser(
				organizationId,
				ctx.session.user.id,
				input.noteId,
			);
			await dbWs.transaction(async (tx) => {
				await tx
					.delete(noteNotes)
					.where(
						and(
							eq(noteNotes.id, input.noteId),
							eq(noteNotes.organizationId, organizationId),
							eq(noteNotes.ownerUserId, ctx.session.user.id),
						),
					);
				// Delete the backing doc too; its FK cascade removes the note_book_items
				// edge + knowledge_links. Only an explicitly-adopted external doc is left
				// (none today: input never detaches), so this is safe for owned notes.
				if (note.knowledgeDocumentId) {
					await tx
						.delete(knowledgeDocuments)
						.where(
							and(
								eq(knowledgeDocuments.id, note.knowledgeDocumentId),
								eq(knowledgeDocuments.organizationId, organizationId),
							),
						);
				}
			});
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
			await assertSetPublishedRateLimit(ctx.session.user.id);
			const note = await getNoteForUser(
				organizationId,
				ctx.session.user.id,
				input.noteId,
			);

			// Re-validate the body at the publish trust boundary: this is the moment
			// content becomes anonymously reachable, and the note may predate the
			// write-time guard (N5). Validate the AUTHORITATIVE (doc-backed) content,
			// not just the index mirror, so a doc-router edit can't smuggle unsafe MDX
			// onto the public page.
			if (input.isPublished) {
				const content = await resolveNoteContent(note);
				assertNoteMarkdownSafe(content.markdown);
			}

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
					knowledgeDocumentId: noteNotes.knowledgeDocumentId,
					ownerUserId: noteNotes.ownerUserId,
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

			// Read the authoritative content from the backing doc (system of record),
			// falling back to the inline mirror for legacy rows. Never leak internal
			// ids beyond what the presentation needs.
			const content = await resolveNoteContent(
				note as typeof noteNotes.$inferSelect,
			);
			return {
				id: note.id,
				title: content.title,
				markdown: content.markdown,
				tags: content.tags,
				createdAt: note.createdAt,
				updatedAt: note.updatedAt,
				url: getPublicNoteUrl(input.slug),
			};
		}),

	// --- notebook membership (G): add / remove / reorder ---------------------
	// Edges (note_book_items) are a many-to-many membership keyed by the note's
	// backing knowledge_documents.id, independent of the note's single "home"
	// notebook (note_notes.notebookId, which listNotes reads). These procs manage
	// the EDGE table only; they never touch note_notes or knowledge_documents
	// content. Ownership is enforced via the parent notebook (getNotebookForUser:
	// org + ownerUserId); the document is additionally org-scoped (assertDocInOrg).

	/**
	 * Add a note (by its backing document id) to a notebook, appended at the end.
	 * Idempotent: re-adding an existing edge is a no-op via onConflictDoNothing on
	 * the (note_book_id, document_id) unique index. The append position is
	 * max(sortOrder)+1; a separate select+insert is not atomic under concurrency,
	 * but ties only yield an unstable order (harmless — reads break ties by
	 * createdAt/id) and duplicates are still blocked by the unique index.
	 */
	addNoteToNotebook: protectedProcedure
		.input(addNoteToNotebookSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const notebook = await getNotebookForUser(
				organizationId,
				ctx.session.user.id,
				input.noteBookId,
			);
			await assertDocInOrg(organizationId, input.documentId);

			const [agg] = await db
				.select({ max: max(noteBookItems.sortOrder) })
				.from(noteBookItems)
				.where(eq(noteBookItems.noteBookId, notebook.id));
			const nextSortOrder = (agg?.max ?? -1) + 1;

			await db
				.insert(noteBookItems)
				.values({
					organizationId: notebook.organizationId,
					noteBookId: notebook.id,
					documentId: input.documentId,
					sortOrder: nextSortOrder,
					addedBy: ctx.session.user.id,
				})
				.onConflictDoNothing({
					target: [noteBookItems.noteBookId, noteBookItems.documentId],
				});

			return { ok: true as const };
		}),

	/**
	 * Remove a note from a notebook by deleting ONLY the membership edge. The note
	 * (note_notes) and its backing document (knowledge_documents) are left intact.
	 */
	removeNoteFromNotebook: protectedProcedure
		.input(removeNoteFromNotebookSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const notebook = await getNotebookForUser(
				organizationId,
				ctx.session.user.id,
				input.noteBookId,
			);
			await db
				.delete(noteBookItems)
				.where(
					and(
						eq(noteBookItems.noteBookId, notebook.id),
						eq(noteBookItems.documentId, input.documentId),
						eq(noteBookItems.organizationId, organizationId),
					),
				);
			return { ok: true as const };
		}),

	/**
	 * Persist a new order for a notebook's edges. The input must be the EXACT full
	 * set of the notebook's current edge document ids (no extras, no duplicates,
	 * no missing ids) — a partial list would leave the omitted edges with stale
	 * sortOrder, so it is rejected with BAD_REQUEST. Each edge's sortOrder is set
	 * to its index in `orderedDocumentIds`, all inside one transaction.
	 */
	reorderNotebookItems: protectedProcedure
		.input(reorderNotebookItemsSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const notebook = await getNotebookForUser(
				organizationId,
				ctx.session.user.id,
				input.noteBookId,
			);

			// Reject duplicate ids up front (a duplicate could never be a valid full
			// permutation of the edge set).
			const ordered = input.orderedDocumentIds;
			const orderedSet = new Set(ordered);
			if (orderedSet.size !== ordered.length) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "orderedDocumentIds contains duplicate ids",
				});
			}

			const existing = await db
				.select({ documentId: noteBookItems.documentId })
				.from(noteBookItems)
				.where(
					and(
						eq(noteBookItems.noteBookId, notebook.id),
						eq(noteBookItems.organizationId, organizationId),
					),
				);
			const existingIds = new Set(existing.map((e) => e.documentId));

			// Require an exact match between the input set and the notebook's edges:
			// same size AND every input id is an existing edge (with no dupes + equal
			// size, this also guarantees no edge is omitted).
			const sameSize = existingIds.size === orderedSet.size;
			const allBelong = ordered.every((id) => existingIds.has(id));
			if (!sameSize || !allBelong) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"orderedDocumentIds must be the exact set of the notebook's items",
				});
			}

			await dbWs.transaction(async (tx) => {
				for (let i = 0; i < ordered.length; i++) {
					await tx
						.update(noteBookItems)
						.set({ sortOrder: i })
						.where(
							and(
								eq(noteBookItems.noteBookId, notebook.id),
								// biome-ignore lint/style/noNonNullAssertion: index is in-bounds
								eq(noteBookItems.documentId, ordered[i]!),
								eq(noteBookItems.organizationId, organizationId),
							),
						);
				}
			});

			return { ok: true as const };
		}),
} satisfies TRPCRouterRecord;
