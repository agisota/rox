import { z } from "zod";

/**
 * Zod inputs for the org skill-library router (WS-J §2.2 P1, T2).
 *
 * A skill library is an org-scoped (optionally v2-project-scoped) named grouping
 * of skills that can be assigned to teams. Slugs are kebab-case and unique per
 * org (mirrors the `skills`/`workflow` slug convention).
 */

const slugSchema = z
	.string()
	.min(1)
	.max(80)
	.regex(/^[a-z0-9-]+$/, "Slug must be kebab-case (a-z, 0-9, -)");

export const listLibrariesSchema = z
	.object({ v2ProjectId: z.string().uuid().optional() })
	.optional();

export const libraryIdSchema = z.object({
	libraryId: z.string().uuid(),
});

export const createLibrarySchema = z.object({
	name: z.string().min(1).max(120),
	slug: slugSchema,
	description: z.string().max(2000).optional(),
	v2ProjectId: z.string().uuid().optional(),
});

export const updateLibrarySchema = z.object({
	libraryId: z.string().uuid(),
	name: z.string().min(1).max(120).optional(),
	description: z.string().max(2000).nullable().optional(),
});

export const addLibraryItemSchema = z.object({
	libraryId: z.string().uuid(),
	skillId: z.string().uuid(),
	position: z.number().int().min(0).optional(),
});

export const removeLibraryItemSchema = z.object({
	libraryId: z.string().uuid(),
	skillId: z.string().uuid(),
});

export const assignTeamSchema = z.object({
	libraryId: z.string().uuid(),
	teamId: z.string().uuid(),
});

export const unassignTeamSchema = z.object({
	libraryId: z.string().uuid(),
	teamId: z.string().uuid(),
});
