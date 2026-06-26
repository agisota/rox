/**
 * Pure model for grouping a node type's inspector fields into the sim.ai-style
 * right-panel sections. Kept framework-free so the grouping logic is unit-tested
 * without rendering a form.
 *
 * Pattern provenance (for future contributors):
 * - The categorized, searchable LEFT palette (`NodePaletteDock`) borrows the
 *   sim.ai block-palette pattern: category headers + per-category accent + search.
 * - This RIGHT-panel typed-section grouping borrows the sim.ai inspector pattern:
 *   one block's config is split into labelled sections instead of a flat list.
 * - The data-driven, registry-generated auto-form itself (one definition →
 *   palette + node + inspector + validator) follows the dify.ai pattern.
 * We borrow PATTERNS from simstudioai/sim (Apache-2.0), not code.
 */

import type { NodeFieldDef } from "@rox/workflow-core";

/** Default heading for fields that declare no explicit `section`. */
export const DEFAULT_SECTION = "Основные";

/** A labelled group of inspector fields (preserves declared field order). */
export type FieldSection = {
	/** Section heading (RU). */
	label: string;
	/** Fields in this section, in their declared order. */
	fields: NodeFieldDef[];
};

/**
 * Group `fields` into ordered sections by their `section` label. Fields with no
 * `section` fall into {@link DEFAULT_SECTION}. Sections appear in the order their
 * first field is declared; field order within a section is preserved.
 *
 * Backward-compatible: a node type whose fields declare no `section` yields a
 * single default section, so the inspector renders the same flat form as before.
 */
export function groupFieldSections(fields: NodeFieldDef[]): FieldSection[] {
	const order: string[] = [];
	const byLabel = new Map<string, NodeFieldDef[]>();

	for (const field of fields) {
		const label = field.section ?? DEFAULT_SECTION;
		const bucket = byLabel.get(label);
		if (bucket) {
			bucket.push(field);
		} else {
			byLabel.set(label, [field]);
			order.push(label);
		}
	}

	return order.map((label) => ({
		label,
		fields: byLabel.get(label) ?? [],
	}));
}

/**
 * Whether section headings should be shown. A single default-only section reads
 * as a plain form (no heading) — headings only add value once a node splits its
 * config across ≥2 named sections.
 */
export function shouldShowSectionHeadings(sections: FieldSection[]): boolean {
	if (sections.length <= 1) return false;
	return true;
}
