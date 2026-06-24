/**
 * Pure commit helpers for the registry-driven inspector auto-form. Each maps a
 * raw input string + the field's constraints to either a value to write into
 * `subBlocks[key]` or `null` (meaning: delete the key). Keeping these pure (no
 * React) mirrors `nodePatch.ts` / `graph-adapter.ts` and makes the
 * trim/clamp/blank-delete rules unit-testable — they reproduce exactly what the
 * five hand-written forms did (AgentNodeForm / LoopNodeForm / etc.).
 */

import type { NodeFieldDef } from "@rox/workflow-core";

/**
 * Normalize a text/textarea field. Trims, clamps to `maxLength`, and returns
 * `null` for an empty result (caller deletes the key).
 */
export function commitTextField(
	raw: string,
	field: Pick<NodeFieldDef, "maxLength">,
): string | null {
	const max = field.maxLength ?? Number.POSITIVE_INFINITY;
	const trimmed = raw.trim().slice(0, max);
	return trimmed.length === 0 ? null : trimmed;
}

/**
 * Normalize a number field. Returns `null` for blank/non-numeric input (delete),
 * otherwise clamps into [min, max]. Rounds to an integer only when the field's
 * `step` is an integer ≥ 1 (mirrors maxTurns=round, temperature=float).
 */
export function commitNumberField(
	raw: string,
	field: Pick<NodeFieldDef, "min" | "max" | "step">,
): number | null {
	const trimmed = raw.trim();
	if (trimmed.length === 0) return null;
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed)) return null;
	const isIntStep = field.step !== undefined && Number.isInteger(field.step);
	let value = isIntStep ? Math.round(parsed) : parsed;
	if (field.min !== undefined) value = Math.max(field.min, value);
	if (field.max !== undefined) value = Math.min(field.max, value);
	return value;
}

/** Sentinel Select value for "none" (Radix Select forbids an empty value). */
export const SELECT_NONE = "__none__";

/**
 * Normalize a select field. The `SELECT_NONE` sentinel returns `null` (delete the
 * key); any other value is written verbatim.
 */
export function commitSelectField(raw: string): string | null {
	return raw === SELECT_NONE ? null : raw;
}
