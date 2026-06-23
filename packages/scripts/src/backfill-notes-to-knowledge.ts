/**
 * note_notes → knowledge_documents backfill (N2).
 *
 * Per the D7 spec + owner decision (2026-06-23), a note's content is a
 * `knowledge_documents` row (type='note'). New notes already write a backing doc
 * (see `notebooksRouter.createNote`), but notes created BEFORE the migration
 * have `knowledge_document_id = NULL` and their markdown only in `note_notes`.
 *
 * This one-off copies each such legacy note into a `knowledge_documents` row,
 * links it back via `note_notes.knowledge_document_id`, and wires the
 * `note_book_items` membership edge.
 *
 * Properties:
 *   - IDEMPOTENT: a note that already carries a `knowledge_document_id` is
 *     skipped; re-running never creates duplicate docs or edges (the edge has a
 *     unique (note_book_id, document_id) index, inserted ON CONFLICT DO NOTHING).
 *   - REVERSIBLE: undo by `UPDATE note_notes SET knowledge_document_id = NULL` +
 *     deleting the generated docs (those whose slug starts with `note-` and whose
 *     id is not referenced by any other note). The legacy `note_notes.markdown`
 *     is left intact, so the original content is never destroyed.
 *   - PRECONDITION-SAFE: zero legacy rows → no writes, exits cleanly.
 *
 * The pure planner {@link planNoteBackfill} is unit-tested with no DB; {@link
 * runBackfill} wires it to Drizzle and runs only when executed directly
 * (`bun run packages/scripts/src/backfill-notes-to-knowledge.ts`). It is NEVER a
 * migration step — apply it deliberately against a target branch DB, never prod
 * without explicit confirmation.
 */

import { randomBytes } from "node:crypto";

/** A legacy note row that may need a backing knowledge document. */
export interface LegacyNoteRow {
	id: string;
	organizationId: string;
	notebookId: string;
	ownerUserId: string;
	title: string;
	markdown: string | null;
	tags: string[] | null;
	knowledgeDocumentId: string | null;
}

/** A planned `knowledge_documents` insert for one legacy note. */
export interface PlannedDocument {
	noteId: string;
	notebookId: string;
	organizationId: string;
	createdByUserId: string;
	slug: string;
	title: string;
	markdown: string;
	tags: string[];
}

export interface BackfillPlan {
	/** Docs to create + link (one per legacy, unlinked note). */
	documents: PlannedDocument[];
	/** Notes skipped because they already carry a backing doc. */
	skipped: number;
}

/** Generate a kebab-case slug that satisfies `knowledgeSlugSchema`. */
export function backfillNoteSlug(): string {
	const rand = BigInt(`0x${randomBytes(9).toString("hex")}`).toString(36);
	return `note-${rand}`;
}

/**
 * Pure planner: decide, for a batch of note rows, which need a backing doc.
 * A note already carrying a `knowledge_document_id` is left untouched, which is
 * what makes re-running the backfill a no-op.
 */
export function planNoteBackfill(
	rows: LegacyNoteRow[],
	slugFor: () => string = backfillNoteSlug,
): BackfillPlan {
	const documents: PlannedDocument[] = [];
	let skipped = 0;
	for (const row of rows) {
		if (row.knowledgeDocumentId) {
			skipped += 1;
			continue;
		}
		documents.push({
			noteId: row.id,
			notebookId: row.notebookId,
			organizationId: row.organizationId,
			createdByUserId: row.ownerUserId,
			slug: slugFor(),
			title: row.title,
			markdown: row.markdown ?? "",
			tags: row.tags ?? [],
		});
	}
	return { documents, skipped };
}

/* c8 ignore start — DB wiring, exercised only when run directly. */

async function runBackfill(): Promise<void> {
	const { db } = await import("@rox/db/client");
	const { knowledgeDocuments, noteBookItems, noteNotes } = await import(
		"@rox/db/schema"
	);
	const { eq, isNull } = await import("drizzle-orm");

	const rows = (await db
		.select({
			id: noteNotes.id,
			organizationId: noteNotes.organizationId,
			notebookId: noteNotes.notebookId,
			ownerUserId: noteNotes.ownerUserId,
			title: noteNotes.title,
			markdown: noteNotes.markdown,
			tags: noteNotes.tags,
			knowledgeDocumentId: noteNotes.knowledgeDocumentId,
		})
		.from(noteNotes)
		.where(isNull(noteNotes.knowledgeDocumentId))) as LegacyNoteRow[];

	const plan = planNoteBackfill(rows);
	if (plan.documents.length === 0) {
		console.log(
			`[backfill-notes] nothing to do (${plan.skipped} already linked).`,
		);
		return;
	}

	let created = 0;
	for (const planned of plan.documents) {
		const [doc] = await db
			.insert(knowledgeDocuments)
			.values({
				organizationId: planned.organizationId,
				type: "note",
				sourceKind: "manual",
				slug: planned.slug,
				title: planned.title,
				markdown: planned.markdown,
				tags: planned.tags,
				createdByUserId: planned.createdByUserId,
			})
			.returning();
		if (!doc) continue;

		await db
			.update(noteNotes)
			.set({ knowledgeDocumentId: doc.id })
			.where(eq(noteNotes.id, planned.noteId));

		await db
			.insert(noteBookItems)
			.values({
				organizationId: planned.organizationId,
				noteBookId: planned.notebookId,
				documentId: doc.id,
				addedBy: planned.createdByUserId,
			})
			.onConflictDoNothing();
		created += 1;
	}

	console.log(
		`[backfill-notes] created ${created} knowledge docs (+edges); skipped ${plan.skipped} already-linked notes.`,
	);
}

if (import.meta.main) {
	runBackfill()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error("[backfill-notes] failed:", error);
			process.exit(1);
		});
}

/* c8 ignore stop */
