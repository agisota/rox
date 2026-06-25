/**
 * Pure helper resolving the MiniMap node fill colour for a canvas node. The
 * xyflow `<MiniMap nodeColor>` callback renders to a raw `<rect fill>` and can't
 * read design tokens, so we resolve a literal hex from the registry: prefer the
 * node type's own `render.miniMapColor`, else its category accent colour, else a
 * neutral grey. Kept pure + framework-free for unit testing.
 */

import {
	categoryAccent,
	getNodeType,
	type NodeCategory,
} from "@rox/workflow-core";

const NEUTRAL = "#94a3b8";

/** Resolve a literal MiniMap colour for a persisted block type. */
export function miniMapColorForType(blockType: string | undefined): string {
	if (!blockType) return NEUTRAL;
	const def = getNodeType(blockType);
	if (!def) return NEUTRAL;
	if (def.render.miniMapColor) return def.render.miniMapColor;
	return categoryAccent(def.category as NodeCategory).color;
}
