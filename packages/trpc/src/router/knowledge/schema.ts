import {
	knowledgeDocumentTypeSchema,
	knowledgeListFilterSchema,
	knowledgeSlugSchema,
	knowledgeSourceKindSchema,
	knowledgeSourceRefSchema,
} from "@rox/shared/knowledge";
import { z } from "zod";

export const listKnowledgeSchema = knowledgeListFilterSchema
	.partial()
	.optional();

export const getKnowledgeSchema = z.object({
	slug: knowledgeSlugSchema,
});

export const knowledgeIdSchema = z.object({
	id: z.string().uuid(),
});

export const createKnowledgeSchema = z.object({
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

export const updateKnowledgeSchema = z.object({
	id: z.string().uuid(),
	type: knowledgeDocumentTypeSchema.optional(),
	slug: knowledgeSlugSchema.optional(),
	title: z.string().min(1).max(300).optional(),
	markdown: z.string().optional(),
	frontmatter: z.record(z.string(), z.unknown()).optional(),
	body: z.record(z.string(), z.unknown()).optional(),
	tags: z.array(z.string().min(1).max(80)).optional(),
	v2ProjectId: z.string().uuid().nullable().optional(),
});

export const searchKnowledgeSchema = z.object({
	query: z.string().min(1).max(200),
	type: knowledgeDocumentTypeSchema.optional(),
	tag: z.string().min(1).max(80).optional(),
	v2ProjectId: z.string().uuid().optional(),
	limit: z.number().int().min(1).max(100).default(25),
});

export const backlinksSchema = z.object({
	slug: knowledgeSlugSchema,
});
