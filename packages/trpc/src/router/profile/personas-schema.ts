/**
 * Zod inputs + pure helpers for the agent-persona CRUD router (Hermes-borrow
 * F21).
 *
 * A *persona* is an org-scoped, user-owned agent identity (display name,
 * avatar, `@handle`, accent colour, free-form theme JSON). These helpers are
 * pure — no DB, no tRPC ctx — so the auto-accent default is unit-testable
 * without a live database (mirrors `chat/labels-schema.ts`).
 *
 * Tags ⟂ identity: personas are the who/where (identity) axis, never the
 * `chat_labels` (organization) axis.
 */

import { identityGlyph } from "@rox/shared/identity-glyph";
import { z } from "zod";

/** Max persona display-name length (DB column is unbounded `text`). */
export const PERSONA_NAME_MAX = 80;
/** Max accent colour string length (`hsl(...)`/hex/`oklch(...)` all fit). */
export const PERSONA_ACCENT_MAX = 64;
/** Max handle length (slug-safe public `@handle`). */
export const PERSONA_HANDLE_MAX = 32;
/** Max URL length for avatars. */
export const PERSONA_URL_MAX = 2048;

const displayNameSchema = z.string().trim().min(1).max(PERSONA_NAME_MAX);
const accentColorSchema = z.string().trim().min(1).max(PERSONA_ACCENT_MAX);
const avatarUrlSchema = z.string().trim().url().max(PERSONA_URL_MAX);
/** Slug-safe handle: lowercase letters, digits, `_`, no leading/trailing. */
const handleSchema = z
	.string()
	.trim()
	.min(1)
	.max(PERSONA_HANDLE_MAX)
	.regex(/^[a-z0-9_]+$/, "Только строчные латинские буквы, цифры и «_».");

/**
 * Free-form persona theme (model, gateway, skills, …). Opaque to the DB; the
 * shape stays permissive on purpose so F22/F23/F29 can extend it without a
 * migration. Known fields are typed for the card; unknown keys pass through.
 */
export const personaThemeSchema = z
	.object({
		model: z.string().trim().min(1).max(120).optional(),
		gateway: z.string().trim().min(1).max(120).optional(),
		skills: z.array(z.string().trim().min(1).max(120)).max(64).optional(),
	})
	.passthrough();

export type PersonaTheme = z.infer<typeof personaThemeSchema>;

export const personaIdSchema = z.object({
	personaId: z.string().uuid(),
});

export const createPersonaSchema = z.object({
	displayName: displayNameSchema,
	avatarUrl: avatarUrlSchema.optional(),
	handle: handleSchema.optional(),
	// Optional: when omitted the server defaults to the deterministic auto-accent
	// (`defaultPersonaAccent(displayName)`).
	accentColor: accentColorSchema.optional(),
	theme: personaThemeSchema.optional(),
});

export const updatePersonaSchema = z.object({
	personaId: z.string().uuid(),
	displayName: displayNameSchema.optional(),
	// `null` explicitly clears; `undefined` leaves unchanged.
	avatarUrl: avatarUrlSchema.nullable().optional(),
	handle: handleSchema.nullable().optional(),
	accentColor: accentColorSchema.optional(),
	theme: personaThemeSchema.nullable().optional(),
});

/**
 * Deterministic auto-accent for a persona display name: the same name always
 * yields the same `hsl(...)` string, shared with identity avatars (F24). Used
 * as the `agent_personas.accent_color` default when the caller supplies none.
 */
export function defaultPersonaAccent(displayName: string): string {
	return identityGlyph(displayName).background;
}
