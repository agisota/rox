/**
 * Zod inputs for the org chat Saved-Views registry (Hermes-borrow F17).
 *
 * A *Saved View* is an org-scoped, named boolean tag filter over the chat list;
 * its filter expression is the serialisable `SavedViewRule` authored in the
 * shared core (`@rox/shared/chat-saved-view`), so the same rule round-trips
 * unchanged across web, desktop, and mobile. These schemas only validate the
 * CRUD inputs — the rule shape itself is owned by `savedViewRuleSchema`.
 */

import { savedViewRuleSchema } from "@rox/shared/chat-saved-view";
import { z } from "zod";

/** Max Saved-View name length (DB column is unbounded `text`; input cap). */
export const SAVED_VIEW_NAME_MAX = 60;
/** Max colour string length (`hsl(...)`/hex/`oklch(...)` all fit). */
export const SAVED_VIEW_COLOR_MAX = 64;

/** A non-empty, trimmed Saved-View name. */
const savedViewNameSchema = z.string().trim().min(1).max(SAVED_VIEW_NAME_MAX);

/** A ready-to-use CSS colour string (validated for length, not format). */
const savedViewColorSchema = z.string().trim().min(1).max(SAVED_VIEW_COLOR_MAX);

export const savedViewIdSchema = z.object({
	savedViewId: z.string().uuid(),
});

export const createSavedViewSchema = z.object({
	name: savedViewNameSchema,
	// The serialisable boolean tag-filter expression (validated by the shared
	// schema). Defaults to the empty rule (matches everything) when omitted.
	rule: savedViewRuleSchema.optional(),
	// Optional: defaults server-side to the deterministic auto-colour.
	color: savedViewColorSchema.optional(),
});

export const updateSavedViewSchema = z.object({
	savedViewId: z.string().uuid(),
	name: savedViewNameSchema.optional(),
	rule: savedViewRuleSchema.optional(),
	// `null` explicitly clears the colour; `undefined` leaves it unchanged.
	color: savedViewColorSchema.nullable().optional(),
});
