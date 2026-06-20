/**
 * Rox Notes (D7) — Workspace Suite P2.
 *
 * A thin, org-scoped + per-user note model that REUSES the knowledge engine
 * (`knowledge_documents`, see ./knowledge) instead of duplicating it: every note
 * carries its own markdown for the fast notebook editor path, and MAY reference a
 * `knowledge_documents` row so a note can be promoted into / mirrored from the
 * MDX notebook substrate (backlinks, wikilinks, distillation) without copying
 * storage. The dashboard router uses the same reuse rule (WS-J §1.6).
 *
 *   note_notebooks  → org-scoped, per-owner buckets that group notes
 *   note_notes      → markdown notes (tags[], optional publish slug, optional
 *                     knowledge_documents ref)
 *   note_backlinks  → materialized note→note links (for a lightweight backlink
 *                     panel); a link may be unresolved while its target slug does
 *                     not yet exist
 *
 * Org scoping mirrors the dashboard tables: notebooks own `organization_id`;
 * notes denormalize `organization_id` (and `notebook_id`) so a shape-filter by
 * org is a plain `organization_id = $1` predicate. Per-user ownership is carried
 * by `owner_user_id` so the router can scope reads/writes to the caller.
 *
 * Public sharing reuses the per-row `public_slug` convention (cf. profile notes /
 * public_shares): a note with a non-null `public_slug` + `is_published = true`
 * is readable unauthenticated at `/s/<slug>` style routes.
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { knowledgeDocuments } from "./knowledge";
import { v2Projects } from "./schema";

// ---------------------------------------------------------------------------
// note_notebooks — org-scoped, per-owner grouping of notes
// ---------------------------------------------------------------------------

export const noteNotebooks = pgTable(
	"note_notebooks",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "set null",
		}),
		// The member who owns the notebook. Notes are per-user within an org.
		ownerUserId: uuid("owner_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		name: text().notNull(),
		// Optional emoji / icon token for the sidebar.
		icon: text(),
		position: integer().notNull().default(0),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("note_notebooks_org_idx").on(t.organizationId),
		index("note_notebooks_owner_idx").on(t.ownerUserId),
		index("note_notebooks_project_idx").on(t.v2ProjectId),
	],
);

export type InsertNoteNotebook = typeof noteNotebooks.$inferInsert;
export type SelectNoteNotebook = typeof noteNotebooks.$inferSelect;

// ---------------------------------------------------------------------------
// note_notes — markdown notes (tags, optional publish slug + knowledge ref)
// ---------------------------------------------------------------------------

export const noteNotes = pgTable(
	"note_notes",
	{
		id: uuid().primaryKey().defaultRandom(),
		notebookId: uuid("notebook_id")
			.notNull()
			.references(() => noteNotebooks.id, { onDelete: "cascade" }),
		// Denormalized from the notebook for direct org-level queries + Electric.
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		// Per-user owner (the note author); copied from the parent notebook on write.
		ownerUserId: uuid("owner_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		title: text().notNull(),
		// Source markdown for the fast notebook editor path.
		markdown: text().notNull().default(""),
		tags: jsonb().$type<string[]>().notNull().default([]),

		// REUSE the knowledge engine: when set, this note is mirrored into /
		// distilled from a knowledge_documents row. set-null detaches on delete
		// rather than destroying the note.
		knowledgeDocumentId: uuid("knowledge_document_id").references(
			() => knowledgeDocuments.id,
			{ onDelete: "set null" },
		),

		// Public share: a unique slug + published flag opens the note read-only.
		isPublished: boolean("is_published").notNull().default(false),
		publicSlug: text("public_slug"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("note_notes_notebook_idx").on(t.notebookId),
		index("note_notes_org_idx").on(t.organizationId),
		index("note_notes_owner_idx").on(t.ownerUserId),
		index("note_notes_knowledge_document_idx").on(t.knowledgeDocumentId),
		uniqueIndex("note_notes_public_slug_unique").on(t.publicSlug),
	],
);

export type InsertNoteNote = typeof noteNotes.$inferInsert;
export type SelectNoteNote = typeof noteNotes.$inferSelect;

// ---------------------------------------------------------------------------
// note_backlinks — materialized note→note links for a backlink panel
// ---------------------------------------------------------------------------

export const noteBacklinks = pgTable(
	"note_backlinks",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		sourceNoteId: uuid("source_note_id")
			.notNull()
			.references(() => noteNotes.id, { onDelete: "cascade" }),
		// Null while unresolved (the referenced title/slug has no note yet).
		targetNoteId: uuid("target_note_id").references(() => noteNotes.id, {
			onDelete: "set null",
		}),
		// The raw link target (note title) as written in the source markdown.
		targetTitle: text("target_title").notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("note_backlinks_org_idx").on(t.organizationId),
		index("note_backlinks_source_idx").on(t.sourceNoteId),
		index("note_backlinks_target_idx").on(t.targetNoteId),
		uniqueIndex("note_backlinks_source_target_unique").on(
			t.sourceNoteId,
			t.targetTitle,
		),
	],
);

export type InsertNoteBacklink = typeof noteBacklinks.$inferInsert;
export type SelectNoteBacklink = typeof noteBacklinks.$inferSelect;
