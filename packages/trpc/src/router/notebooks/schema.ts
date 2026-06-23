import { z } from "zod";

/**
 * Zod inputs for the Notes (D7) router — Workspace Suite P2.
 *
 * Notebooks group markdown notes; both are org-scoped AND per-user (the caller
 * only ever sees / mutates rows they own). A note may carry tags and an optional
 * public share slug. The model REUSES the knowledge engine via an optional
 * `knowledgeDocumentId` link rather than duplicating document storage.
 */

const PUBLIC_SLUG_RE = /^[A-Za-z0-9_-]+$/;

export const tagSchema = z.string().trim().min(1).max(40);

// --- notebooks ---------------------------------------------------------------

export const listNotebooksSchema = z
	.object({ v2ProjectId: z.string().uuid().optional() })
	.optional();

export const notebookIdSchema = z.object({
	notebookId: z.string().uuid(),
});

export const createNotebookSchema = z.object({
	name: z.string().trim().min(1).max(120),
	icon: z.string().trim().max(16).optional(),
	v2ProjectId: z.string().uuid().optional(),
	position: z.number().int().min(0).optional(),
});

export const updateNotebookSchema = z.object({
	notebookId: z.string().uuid(),
	name: z.string().trim().min(1).max(120).optional(),
	icon: z.string().trim().max(16).nullable().optional(),
	position: z.number().int().min(0).optional(),
});

// --- notes -------------------------------------------------------------------

export const listNotesSchema = z.object({
	notebookId: z.string().uuid().optional(),
	// Filter to notes carrying ALL of these tags.
	tags: z.array(tagSchema).max(20).optional(),
});

export const noteIdSchema = z.object({
	noteId: z.string().uuid(),
});

export const createNoteSchema = z.object({
	notebookId: z.string().uuid(),
	title: z.string().trim().min(1).max(200),
	markdown: z.string().max(500_000).optional(),
	tags: z.array(tagSchema).max(20).optional(),
	knowledgeDocumentId: z.string().uuid().optional(),
});

export const updateNoteSchema = z.object({
	noteId: z.string().uuid(),
	title: z.string().trim().min(1).max(200).optional(),
	markdown: z.string().max(500_000).optional(),
	tags: z.array(tagSchema).max(20).optional(),
	knowledgeDocumentId: z.string().uuid().nullable().optional(),
});

export const setNotePublishedSchema = z.object({
	noteId: z.string().uuid(),
	isPublished: z.boolean(),
});

export const getPublicNoteSchema = z.object({
	slug: z.string().min(6).max(80).regex(PUBLIC_SLUG_RE),
});

// --- notebook membership (G) -------------------------------------------------
// Membership edges (note_book_items) are keyed by the note's backing
// `knowledge_documents.id` (the system of record since N2), NOT the note id.
// Callers therefore pass `documentId = note.knowledgeDocumentId`.

export const addNoteToNotebookSchema = z.object({
	noteBookId: z.string().uuid(),
	documentId: z.string().uuid(),
});

export const removeNoteFromNotebookSchema = z.object({
	noteBookId: z.string().uuid(),
	documentId: z.string().uuid(),
});

export const reorderNotebookItemsSchema = z.object({
	noteBookId: z.string().uuid(),
	// The FULL set of the notebook's edge document ids in their new order.
	orderedDocumentIds: z.array(z.string().uuid()).min(1).max(500),
});
