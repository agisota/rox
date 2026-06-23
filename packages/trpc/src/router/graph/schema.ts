/**
 * Graph core (#01) — Zod input/output schemas for `graphRouter` (spec §2.1).
 *
 * Reuses the core enums from `@rox/db/enums` and the slug/sourceRef schemas from
 * `@rox/shared/knowledge` so the wikilink slug rules stay shared with notes.
 */

import {
	activityEventKindEnum,
	edgeRelationEnum,
	entityKindEnum,
	entityStatusEnum,
	identityKindEnum,
} from "@rox/db/enums";
import {
	knowledgeSlugSchema,
	knowledgeSourceRefSchema,
} from "@rox/shared/knowledge";
import { z } from "zod";

const uuid = z.string().uuid();
const record = z.record(z.string(), z.unknown());

export const storageRefSchema = z
	.object({
		bucket: z.string(),
		key: z.string(),
		mime: z.string(),
		size: z.number().int(),
	})
	.partial();

export const activityPayloadSchema = z
	.object({
		app: z.string(),
		window: z.string(),
		url: z.string(),
		summary: z.string(),
	})
	.partial()
	.extend({ frameRefs: z.array(z.string()).optional() });

// --- inputs ----------------------------------------------------------------

export const graphCreateSchema = z.object({
	idempotencyKey: uuid,
	kind: entityKindEnum,
	title: z.string().min(1).max(300),
	slug: knowledgeSlugSchema.optional(),
	markdown: z.string().optional(),
	body: record.optional(),
	storageRef: storageRefSchema.optional(),
	sourceRef: knowledgeSourceRefSchema.optional(),
	v2ProjectId: uuid.optional(),
});

// strict discriminated union: exactly one of {entityId} | {kind, slug}.
export const graphGetSchema = z.union([
	z.object({ entityId: uuid }).strict(),
	z.object({ kind: entityKindEnum, slug: knowledgeSlugSchema }).strict(),
]);

export const graphUpdateSchema = z.object({
	entityId: uuid,
	title: z.string().min(1).max(300).optional(),
	slug: knowledgeSlugSchema.optional(),
	markdown: z.string().optional(),
	body: record.optional(),
	status: entityStatusEnum.optional(),
	v2ProjectId: uuid.nullable().optional(),
});

export const graphArchiveSchema = z.object({
	entityId: uuid,
	status: z.enum(["archived", "trashed", "active"]),
});

export const graphListByKindSchema = z.object({
	kind: entityKindEnum,
	status: entityStatusEnum.default("active"),
	cursor: uuid.optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const graphLinkSchema = z
	.object({
		idempotencyKey: uuid,
		sourceEntityId: uuid,
		targetEntityId: uuid.optional(),
		targetSlug: knowledgeSlugSchema.optional(),
		relation: edgeRelationEnum,
		metadata: record.optional(),
	})
	.refine((value) => value.targetEntityId || value.targetSlug, {
		message: "targetEntityId or targetSlug is required",
	});

export const graphPromoteSchema = z.object({
	idempotencyKey: uuid,
	sourceEntityId: uuid,
	toKind: entityKindEnum,
	title: z.string().min(1).max(300),
	markdown: z.string().optional(),
	relation: edgeRelationEnum.default("derived_from"),
});

export const graphNeighborsSchema = z.object({
	entityId: uuid,
	depth: z.number().int().min(1).max(2).default(1),
	relations: z.array(edgeRelationEnum).optional(),
	limit: z.number().int().min(1).max(500).default(200),
});

export const graphBacklinksSchema = z.object({
	slug: knowledgeSlugSchema,
	relation: edgeRelationEnum.default("links_to"),
});

// Project OS (#01, Phase-1): walk one v2_project's object graph.
export const graphProjectGraphSchema = z.object({
	v2ProjectId: uuid,
	status: entityStatusEnum.default("active"),
	limit: z.number().int().min(1).max(500).default(200),
});

export const graphResolveIdentitySchema = z.object({
	idempotencyKey: uuid,
	kind: identityKindEnum,
	value: z.string().min(1).max(320),
	displayName: z.string().min(1).max(200).optional(),
});

export const graphSearchSchema = z.object({
	query: z.string().min(1).max(200),
	kinds: z.array(entityKindEnum).optional(),
	mode: z.enum(["semantic", "keyword"]).default("semantic"),
	v2ProjectId: uuid.optional(),
	status: entityStatusEnum.default("active"),
	limit: z.number().int().min(1).max(50).default(25),
});

export const graphRecordActivitySchema = z.object({
	idempotencyKey: uuid.optional(),
	ts: z.coerce.date(),
	durationMs: z.number().int().optional(),
	kind: activityEventKindEnum,
	sourceEntityId: uuid.optional(),
	payload: activityPayloadSchema.optional(),
});

// --- outputs ---------------------------------------------------------------

export const entitySchema = z.object({
	id: uuid,
	kind: entityKindEnum,
	slug: z.string().nullable(),
	title: z.string(),
	markdown: z.string().nullable(),
	body: record.nullable(),
	storageRef: storageRefSchema.nullable(),
	sourceRef: record.nullable(),
	status: entityStatusEnum,
	v2ProjectId: uuid.nullable(),
	createdByUserId: uuid.nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type EntityOutput = z.infer<typeof entitySchema>;

export const entitySummarySchema = z.object({
	id: uuid,
	kind: entityKindEnum,
	slug: z.string().nullable(),
	title: z.string(),
	status: entityStatusEnum,
	updatedAt: z.date(),
});
export type EntitySummaryOutput = z.infer<typeof entitySummarySchema>;

export const edgeSchema = z.object({
	id: uuid,
	sourceEntityId: uuid,
	targetEntityId: uuid.nullable(),
	targetSlug: z.string().nullable(),
	resolved: z.boolean(),
	relation: edgeRelationEnum,
	metadata: record,
	createdAt: z.date(),
});
export type EdgeOutput = z.infer<typeof edgeSchema>;

export const graphNodeSchema = z.object({
	entityId: uuid,
	kind: entityKindEnum,
	title: z.string(),
	slug: z.string().nullable(),
});

export const graphEdgeSchema = z.object({
	id: uuid,
	sourceEntityId: uuid,
	targetEntityId: uuid.nullable(),
	relation: edgeRelationEnum,
	resolved: z.boolean(),
});

export const neighborsResultSchema = z.object({
	nodes: z.array(graphNodeSchema),
	edges: z.array(graphEdgeSchema),
	truncated: z.boolean(),
});

export const projectGraphNodeSchema = graphNodeSchema.extend({
	// True when the node is itself scoped to the project (v2_project_id = P).
	inProject: z.boolean(),
});

export const projectGraphResultSchema = z.object({
	nodes: z.array(projectGraphNodeSchema),
	edges: z.array(graphEdgeSchema),
	truncated: z.boolean(),
});
export type ProjectGraphResultOutput = z.infer<typeof projectGraphResultSchema>;

export const backlinkSchema = z.object({
	sourceEntityId: uuid,
	sourceSlug: z.string().nullable(),
	sourceTitle: z.string(),
	resolved: z.boolean(),
});
export type BacklinkOutput = z.infer<typeof backlinkSchema>;

export const searchHitSchema = entitySummarySchema.extend({
	score: z.number().optional(),
	snippet: z.string().optional(),
});

export const searchResultSchema = z.object({
	hits: z.array(searchHitSchema),
	degraded: z.boolean(),
});
