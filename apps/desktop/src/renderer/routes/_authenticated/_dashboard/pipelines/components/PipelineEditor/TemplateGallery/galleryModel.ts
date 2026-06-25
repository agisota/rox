/**
 * Pure model for the templates gallery: filtering + category grouping over the
 * declarative `PIPELINE_TEMPLATES`. Framework-free so the search/grouping is
 * unit-tested without rendering.
 */

import { PIPELINE_TEMPLATES, type PipelineTemplate } from "../../templates";

const UNGROUPED = "Прочее";

/** A gallery section: a category label + its templates. */
export type GalleryGroup = {
	category: string;
	templates: PipelineTemplate[];
};

/** Does a template match the (normalised) lowercase query? */
function matches(t: PipelineTemplate, q: string): boolean {
	if (q.length === 0) return true;
	const haystack = [
		t.id,
		t.name,
		t.description,
		t.category ?? "",
		...(t.tags ?? []),
	]
		.join(" ")
		.toLowerCase();
	return haystack.includes(q);
}

/**
 * Group the templates matching `query` by category, preserving first-seen
 * category order (so the catalog author controls section ordering). Empty
 * categories are omitted. `extra` (e.g. session-local "Save as template"
 * results) is listed FIRST so user templates surface above the built-ins.
 */
export function buildGalleryGroups(
	query: string,
	extra: readonly PipelineTemplate[] = [],
): GalleryGroup[] {
	const q = query.trim().toLowerCase();
	const order: string[] = [];
	const byCategory = new Map<string, PipelineTemplate[]>();

	for (const t of [...extra, ...PIPELINE_TEMPLATES]) {
		if (!matches(t, q)) continue;
		const category = t.category ?? UNGROUPED;
		if (!byCategory.has(category)) {
			byCategory.set(category, []);
			order.push(category);
		}
		byCategory.get(category)?.push(t);
	}

	return order.map((category) => ({
		category,
		templates: byCategory.get(category) ?? [],
	}));
}

/** Count templates across gallery groups. */
export function countTemplates(groups: GalleryGroup[]): number {
	return groups.reduce((sum, g) => sum + g.templates.length, 0);
}

/** Distinct block types used by a template (for the card's type chips). */
export function templateNodeTypes(t: PipelineTemplate): string[] {
	const seen = new Set<string>();
	for (const block of Object.values(t.build().blocks)) seen.add(block.type);
	return [...seen];
}
