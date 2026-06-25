/**
 * Zod inputs + pure helpers for the org chat-label registry (Hermes-borrow F11)
 * and the label filters on `chat.listSessions` (F10/F17).
 *
 * A *chat label* is org-scoped presentation (colour + optional icon) keyed by
 * name; the label-to-session membership stays in `chat_sessions.labels` (a
 * `jsonb<string[]>` of names). These helpers are pure — no DB, no tRPC ctx — so
 * the auto-colour default and the jsonb filter builder are unit-testable without
 * a live database (mirrors `notebooks/search-notes.ts`).
 *
 * Tags ⟂ identity: labels are the organization axis only, never the
 * persona/org (who/where) axis.
 */

import { identityGlyph } from "@rox/shared/identity-glyph";
import { type Column, type SQL, sql } from "drizzle-orm";
import { z } from "zod";

/** Max label name length (DB column is unbounded `text`; this is the input cap). */
export const LABEL_NAME_MAX = 60;
/** Max colour string length (`hsl(...)`/hex/`oklch(...)` all fit comfortably). */
export const LABEL_COLOR_MAX = 64;
/** Max icon token length (icon name or single emoji). */
export const LABEL_ICON_MAX = 64;

/** A non-empty, trimmed label name (membership keys in `chat_sessions.labels`). */
const labelNameSchema = z.string().trim().min(1).max(LABEL_NAME_MAX);

/** A ready-to-use CSS colour string (validated for length, not format). */
const labelColorSchema = z.string().trim().min(1).max(LABEL_COLOR_MAX);

/** Optional icon token; `null` clears it. */
const labelIconSchema = z.string().trim().min(1).max(LABEL_ICON_MAX);

export const labelIdSchema = z.object({
	labelId: z.string().uuid(),
});

export const createLabelSchema = z.object({
	name: labelNameSchema,
	// Optional: when omitted the server defaults to the deterministic auto-colour
	// (`defaultLabelColor(name)`), so a created label always has a stable colour.
	color: labelColorSchema.optional(),
	icon: labelIconSchema.optional(),
});

export const updateLabelSchema = z.object({
	labelId: z.string().uuid(),
	name: labelNameSchema.optional(),
	color: labelColorSchema.optional(),
	// `null` explicitly clears the icon; `undefined` leaves it unchanged.
	icon: labelIconSchema.nullable().optional(),
});

/** A distinct, non-empty list of label names for a filter param. */
const labelFilterList = z.array(labelNameSchema).min(1);

/**
 * Inputs for `chat.listSessions`. All optional and absent by default, so an
 * empty/absent input is byte-for-byte the previous behaviour (backward
 * compatible). `labelsAll` = session has *every* listed label; `labelsAny` =
 * session has *at least one*.
 */
export const listSessionsSchema = z
	.object({
		labelsAny: labelFilterList.optional(),
		labelsAll: labelFilterList.optional(),
	})
	.optional();

export type ListSessionsInput = z.infer<typeof listSessionsSchema>;

/**
 * Deterministic auto-colour for a label name: the same name always yields the
 * same `hsl(...)` string, shared with identity avatars (F24). Used as the
 * `chat_labels.color` default when the caller supplies none.
 */
export function defaultLabelColor(name: string): string {
	return identityGlyph(name).background;
}

/**
 * Build the jsonb-array label-membership conditions for a `chat_sessions` query.
 *
 * Returns drizzle `SQL` predicates (to be AND-ed into the existing `where`), or
 * an empty array when no label filter is requested — so callers stay backward
 * compatible by spreading the result. Uses the `@>` jsonb-contains operator (the
 * `knowledge_documents.tags` precedent):
 *   - `labelsAll` → `labels @> '["a","b"]'::jsonb` (contains ALL listed names).
 *   - `labelsAny` → OR of single-element containments (contains ANY listed name),
 *     since `@>` alone is all-or-nothing.
 *
 * Pure: takes the column + parsed names, returns SQL; no DB access.
 */
export function buildLabelFilterConditions(params: {
	labelsColumn: Column;
	labelsAny?: readonly string[];
	labelsAll?: readonly string[];
}): SQL[] {
	const { labelsColumn, labelsAny, labelsAll } = params;
	const conditions: SQL[] = [];

	if (labelsAll && labelsAll.length > 0) {
		conditions.push(
			sql`${labelsColumn} @> ${JSON.stringify([...labelsAll])}::jsonb`,
		);
	}

	if (labelsAny && labelsAny.length > 0) {
		const anyClauses = labelsAny.map(
			(name) => sql`${labelsColumn} @> ${JSON.stringify([name])}::jsonb`,
		);
		// OR the single-element containments together, wrapped in parens so it
		// AND-composes safely with the surrounding session/org predicates.
		conditions.push(sql`(${sql.join(anyClauses, sql` OR `)})`);
	}

	return conditions;
}
