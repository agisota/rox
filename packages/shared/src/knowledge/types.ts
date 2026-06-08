/**
 * Shared domain types for the knowledge / notebook layer (fumadocs epic).
 *
 * These mirror the `knowledge_documents` Drizzle schema but are kept dependency
 * -free (zod only) so both the backend (`@rox/trpc`, `@rox/mcp`) and the web app
 * can consume them without importing the DB package.
 */

import { z } from "zod";

export const knowledgeDocumentTypeValues = [
	"note",
	"prd",
	"spec",
	"doc",
	"meeting_summary",
	"reference",
] as const;
export const knowledgeDocumentTypeSchema = z.enum(knowledgeDocumentTypeValues);
export type KnowledgeDocumentType = z.infer<typeof knowledgeDocumentTypeSchema>;

export const knowledgeSourceKindValues = [
	"manual",
	"conversation",
	"agent_run",
	"obsidian_import",
	"file",
] as const;
export const knowledgeSourceKindSchema = z.enum(knowledgeSourceKindValues);
export type KnowledgeSourceKind = z.infer<typeof knowledgeSourceKindSchema>;

/** Kebab-case slug used to address a document and to resolve `[[wikilinks]]`. */
export const knowledgeSlugSchema = z
	.string()
	.min(1)
	.max(160)
	.regex(
		/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/,
		"Slug must be kebab-case (a-z, 0-9, -, /)",
	);

export const knowledgeSourceRefSchema = z
	.object({
		conversationId: z.string().optional(),
		runId: z.string().optional(),
		importBatchId: z.string().optional(),
		filePath: z.string().optional(),
	})
	.catchall(z.unknown());
export type KnowledgeSourceRef = z.infer<typeof knowledgeSourceRefSchema>;

/** A notebook document as surfaced to clients. */
export interface KnowledgeDocument {
	id: string;
	organizationId: string;
	v2ProjectId: string | null;
	type: KnowledgeDocumentType;
	sourceKind: KnowledgeSourceKind;
	slug: string;
	title: string;
	markdown: string | null;
	frontmatter: Record<string, unknown> | null;
	body: Record<string, unknown> | null;
	tags: string[];
	sourceRef: KnowledgeSourceRef | null;
	createdByUserId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Filters accepted by `KnowledgeSource.list`. */
export interface KnowledgeListFilter {
	type?: KnowledgeDocumentType;
	tag?: string;
	v2ProjectId?: string;
}
export const knowledgeListFilterSchema = z.object({
	type: knowledgeDocumentTypeSchema.optional(),
	tag: z.string().min(1).max(80).optional(),
	v2ProjectId: z.string().uuid().optional(),
});

/** A single search hit. */
export interface KnowledgeSearchResult {
	document: KnowledgeDocument;
	/** Relevance score in [0, 1]; higher is better. */
	score: number;
	/** Optional snippet around the match. */
	excerpt?: string;
}

/** A resolved backlink (a document that links to the target). */
export interface KnowledgeBacklink {
	sourceDocumentId: string;
	sourceSlug: string;
	sourceTitle: string;
	resolved: boolean;
}

/** Input for creating/updating a document. */
export const knowledgeUpsertSchema = z.object({
	id: z.string().uuid().optional(),
	type: knowledgeDocumentTypeSchema.default("note"),
	sourceKind: knowledgeSourceKindSchema.default("manual"),
	slug: knowledgeSlugSchema,
	title: z.string().min(1).max(300),
	markdown: z.string().optional(),
	frontmatter: z.record(z.string(), z.unknown()).optional(),
	body: z.record(z.string(), z.unknown()).optional(),
	tags: z.array(z.string().min(1).max(80)).default([]),
	sourceRef: knowledgeSourceRefSchema.optional(),
	v2ProjectId: z.string().uuid().optional(),
});
export type KnowledgeUpsertInput = z.infer<typeof knowledgeUpsertSchema>;
