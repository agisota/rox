import { dashboardSectionKindValues } from "@rox/db/enums";
import { z } from "zod";

/**
 * Zod inputs for the collaborative org dashboard router (WS-J §2.2 P1, T3).
 *
 * A dashboard is an org-scoped (optionally v2-project-scoped) board of typed
 * sections, each holding ordered entries. An entry may carry an inline jsonb
 * `body` and/or reference a `knowledge_documents` row (reuse of the notebook MDX
 * substrate — WS-J §1.6 design rule).
 */

const slugSchema = z
	.string()
	.min(1)
	.max(80)
	.regex(/^[a-z0-9-]+$/, "Slug must be kebab-case (a-z, 0-9, -)");

export const sectionKindSchema = z.enum(dashboardSectionKindValues);

export const listDashboardsSchema = z
	.object({ v2ProjectId: z.string().uuid().optional() })
	.optional();

export const dashboardIdSchema = z.object({
	dashboardId: z.string().uuid(),
});

export const createDashboardSchema = z.object({
	name: z.string().min(1).max(120),
	slug: slugSchema,
	v2ProjectId: z.string().uuid().optional(),
});

export const updateDashboardSchema = z.object({
	dashboardId: z.string().uuid(),
	name: z.string().min(1).max(120),
});

export const createSectionSchema = z.object({
	dashboardId: z.string().uuid(),
	kind: sectionKindSchema,
	title: z.string().max(200).optional(),
	position: z.number().int().min(0).optional(),
});

export const updateSectionSchema = z.object({
	sectionId: z.string().uuid(),
	title: z.string().max(200).nullable().optional(),
	position: z.number().int().min(0).optional(),
});

export const deleteSectionSchema = z.object({
	sectionId: z.string().uuid(),
});

export const createEntrySchema = z.object({
	sectionId: z.string().uuid(),
	body: z.record(z.string(), z.unknown()).optional(),
	knowledgeDocumentId: z.string().uuid().optional(),
	status: z.string().max(80).optional(),
	priority: z.string().max(80).optional(),
	position: z.number().int().min(0).optional(),
});

export const updateEntrySchema = z.object({
	entryId: z.string().uuid(),
	body: z.record(z.string(), z.unknown()).optional(),
	knowledgeDocumentId: z.string().uuid().nullable().optional(),
	status: z.string().max(80).nullable().optional(),
	priority: z.string().max(80).nullable().optional(),
	position: z.number().int().min(0).optional(),
});

export const deleteEntrySchema = z.object({
	entryId: z.string().uuid(),
});
