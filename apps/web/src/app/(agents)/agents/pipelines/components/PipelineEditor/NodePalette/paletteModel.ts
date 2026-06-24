/**
 * Pure model for the node palette: turns the shared node-type registry into
 * categorized, searchable groups. Kept framework-free so the search/grouping
 * logic is unit-tested without rendering.
 */

import {
	listNodeTypes,
	NODE_CATEGORY_LABEL,
	NODE_CATEGORY_ORDER,
	type NodeCategory,
	type NodeTypeDefinition,
} from "@rox/workflow-core";

/** One palette entry (a draggable / clickable addable node type). */
export type PaletteEntry = {
	id: string;
	label: string;
	description?: string;
	category: NodeCategory;
	icon: string;
};

/** A palette section — a category header + its matching entries. */
export type PaletteGroup = {
	category: NodeCategory;
	label: string;
	entries: PaletteEntry[];
};

function toEntry(def: NodeTypeDefinition): PaletteEntry {
	return {
		id: def.id,
		label: def.label,
		description: def.description,
		category: def.category,
		icon: def.render.icon,
	};
}

/** Does an entry match the (already-normalised) lowercase query? */
function matches(entry: PaletteEntry, q: string): boolean {
	if (q.length === 0) return true;
	const haystack = [
		entry.label,
		entry.description ?? "",
		entry.id,
		NODE_CATEGORY_LABEL[entry.category],
	]
		.join(" ")
		.toLowerCase();
	return haystack.includes(q);
}

/**
 * Build the categorized palette groups for the given query. Singletons (e.g.
 * `start`) are excluded (they can't be added). Empty groups are omitted; groups
 * follow {@link NODE_CATEGORY_ORDER}.
 */
export function buildPaletteGroups(query: string): PaletteGroup[] {
	const q = query.trim().toLowerCase();
	const entries = listNodeTypes()
		.filter((def) => !def.singleton)
		.map(toEntry)
		.filter((entry) => matches(entry, q));

	const groups: PaletteGroup[] = [];
	for (const category of NODE_CATEGORY_ORDER) {
		const inGroup = entries.filter((entry) => entry.category === category);
		if (inGroup.length > 0) {
			groups.push({
				category,
				label: NODE_CATEGORY_LABEL[category],
				entries: inGroup,
			});
		}
	}
	return groups;
}

/** Total number of entries across all groups (for an empty-state check). */
export function countEntries(groups: PaletteGroup[]): number {
	return groups.reduce((sum, group) => sum + group.entries.length, 0);
}

/** The dataTransfer MIME type used when dragging a palette entry onto the canvas. */
export const PALETTE_DND_MIME = "application/rox-pipeline-node";
