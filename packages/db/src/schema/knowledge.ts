/**
 * Rox Knowledge / Notebook layer — fumadocs epic.
 *
 * `knowledge_documents` are MDX-backed notes/PRDs/specs/docs that live in the
 * embedded notebook (apps/web). They are org-scoped, optionally tied to a v2
 * project, and may be produced manually, distilled from a chat conversation,
 * captured from an agent run, or imported from Obsidian.
 *
 * `knowledge_links` materialize `[[wikilinks]]` between documents so the UI can
 * render backlinks. A link may be unresolved (its target slug does not yet
 * exist) — `targetDocumentId` is then null and `resolved` is false.
 *
 * Pattern-matches the `artifacts` table (org cascade FK, `v2_project_id`
 * set-null FK, jsonb body, indexes). NEVER hand-edit migrations — change this
 * file then run `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
	boolean,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { notesSearchVectorSql } from "./_shared";
import { organizations, users } from "./auth";
import {
	knowledgeDocumentTypeValues,
	knowledgeSourceKindValues,
} from "./enums";
import { v2Projects } from "./schema";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const knowledgeDocumentType = pgEnum(
	"knowledge_document_type",
	knowledgeDocumentTypeValues,
);
export const knowledgeSourceKind = pgEnum(
	"knowledge_source_kind",
	knowledgeSourceKindValues,
);

/**
 * Provenance for a document — e.g. the chat conversation or workflow run that
 * produced it. Kept loose (typed jsonb) until the integration surfaces land.
 */
export type KnowledgeSourceRef = {
	conversationId?: string;
	runId?: string;
	importBatchId?: string;
	filePath?: string;
} & Record<string, unknown>;

// ---------------------------------------------------------------------------
// Full-text search vector (D7 notes FTS)
// ---------------------------------------------------------------------------

/**
 * Postgres text-search configuration for note FTS. A STRING LITERAL (never a
 * column) so the derived `to_tsvector(...)` expression is IMMUTABLE and therefore
 * indexable — `to_tsvector('simple', text)` is immutable whereas
 * `to_tsvector(<column>, text)` is not and the CREATE INDEX would fail.
 *
 * `'simple'` (no stemming, language-agnostic) is the safe default for the app's
 * mixed Russian/English note content; `'english'`/`'russian'` would bias one
 * language and mangle the other.
 */
// The FTS config + vector helpers live in the core `_shared` layer so every
// entity schema (chat, journal, tasks, drive) can build an identically-shaped
// search vector without a cross-domain import cycle. Re-exported here (and
// `notesSearchVectorSql` is also imported above for the GIN index below) so the
// existing notes index/query call sites keep their `./knowledge` import path.
export { entitySearchVectorSql, NOTES_FTS_CONFIG } from "./_shared";
export { notesSearchVectorSql };

// ---------------------------------------------------------------------------
// knowledge_documents — MDX notebook documents
// ---------------------------------------------------------------------------

export const knowledgeDocuments = pgTable(
	"knowledge_documents",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "set null",
		}),

		type: knowledgeDocumentType().notNull().default("note"),
		sourceKind: knowledgeSourceKind("source_kind").notNull().default("manual"),

		slug: text().notNull(),
		title: text().notNull(),
		// Rendered/source MDX content.
		markdown: text(),
		// Parsed frontmatter + any structured body the editor keeps alongside MDX.
		frontmatter: jsonb().$type<Record<string, unknown>>(),
		body: jsonb().$type<Record<string, unknown>>(),
		tags: jsonb().$type<string[]>().notNull().default([]),
		sourceRef: jsonb("source_ref").$type<KnowledgeSourceRef>(),

		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("knowledge_documents_org_idx").on(t.organizationId),
		index("knowledge_documents_project_idx").on(t.v2ProjectId),
		index("knowledge_documents_type_idx").on(t.type),
		uniqueIndex("knowledge_documents_org_slug_unique").on(
			t.organizationId,
			t.slug,
		),
		// Expression GIN index backing the notes FTS (D7). Built from the SAME
		// `notesSearchVectorSql` the query uses, so the indexed expression and the
		// query expression cannot drift (a drift would force a seq scan). Mirrors the
		// expression-GIN precedent at auth.ts (`apikeys_metadata_trgm_idx`).
		index("knowledge_documents_fts_idx").using(
			"gin",
			notesSearchVectorSql({ titleCol: t.title, markdownCol: t.markdown }),
		),
	],
);

export type InsertKnowledgeDocument = typeof knowledgeDocuments.$inferInsert;
export type SelectKnowledgeDocument = typeof knowledgeDocuments.$inferSelect;

// ---------------------------------------------------------------------------
// knowledge_links — materialized [[wikilink]] edges (for backlinks)
// ---------------------------------------------------------------------------

export const knowledgeLinks = pgTable(
	"knowledge_links",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		sourceDocumentId: uuid("source_document_id")
			.notNull()
			.references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
		// Null while unresolved (target slug does not yet exist).
		targetDocumentId: uuid("target_document_id").references(
			() => knowledgeDocuments.id,
			{ onDelete: "set null" },
		),
		// The raw wikilink target (kebab slug) as written in the source document.
		targetSlug: text("target_slug").notNull(),
		resolved: boolean().notNull().default(false),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("knowledge_links_org_idx").on(t.organizationId),
		index("knowledge_links_source_idx").on(t.sourceDocumentId),
		index("knowledge_links_target_idx").on(t.targetDocumentId),
		index("knowledge_links_target_slug_idx").on(t.targetSlug),
		uniqueIndex("knowledge_links_source_target_unique").on(
			t.sourceDocumentId,
			t.targetSlug,
		),
	],
);

export type InsertKnowledgeLink = typeof knowledgeLinks.$inferInsert;
export type SelectKnowledgeLink = typeof knowledgeLinks.$inferSelect;
