import { z } from "zod";

/**
 * Zod inputs for the profile-scoped capability routers (F47, #644).
 *
 * Two surfaces:
 *   - skill assignments per persona (list / assign / setEnabled / remove)
 *   - MCP inventory (categories + enabled/total coverage + searchable tools)
 *
 * Everything is implicitly scoped to the caller's active org; a `personaId`
 * input is always re-checked against the active org server-side. No secret
 * fields are accepted or returned.
 */

export const personaIdSchema = z.object({
	personaId: z.string().uuid(),
});

export const assignSkillSchema = z.object({
	personaId: z.string().uuid(),
	skillId: z.string().uuid(),
	// Optional initial enabled state (defaults to true on the table).
	enabled: z.boolean().optional(),
});

export const setSkillEnabledSchema = z.object({
	personaId: z.string().uuid(),
	skillId: z.string().uuid(),
	enabled: z.boolean(),
});

export const removeSkillSchema = z.object({
	personaId: z.string().uuid(),
	skillId: z.string().uuid(),
});

export const assignMcpServerSchema = z.object({
	personaId: z.string().uuid(),
	serverSlug: z.string().min(1).max(128),
	enabled: z.boolean().optional(),
});

export const setMcpServerEnabledSchema = z.object({
	personaId: z.string().uuid(),
	serverSlug: z.string().min(1).max(128),
	enabled: z.boolean(),
});

export const removeMcpServerSchema = z.object({
	personaId: z.string().uuid(),
	serverSlug: z.string().min(1).max(128),
});

export const mcpInventorySchema = z
	.object({
		// Optional per-persona lens: when set, each server/tool carries the
		// persona's `enabled` flag for the coverage badge.
		personaId: z.string().uuid().optional(),
		// Free-text filter over tool name/description (case-insensitive).
		search: z.string().min(1).max(200).optional(),
		// Restrict to one category.
		category: z.string().min(1).max(64).optional(),
	})
	.optional();
