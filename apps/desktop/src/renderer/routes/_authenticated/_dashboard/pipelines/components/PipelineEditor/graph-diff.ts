/**
 * Structural-change detection between two `RoxWorkflowState`s, used to coalesce
 * undo/redo checkpoints. A pure node drag updates only `position`, firing many
 * `applyGraphChange` calls; recording each one would make undo step pixel by
 * pixel. We instead checkpoint only when the *shape* changes — the set of block
 * ids, an edge, a block type, a name, enabled, or subBlocks — not on pure moves.
 */

import type { RoxBlockState, RoxWorkflowState } from "@rox/workflow-core";

/** A stable signature of one block excluding its canvas position. */
function blockSignature(block: RoxBlockState): string {
	return [
		block.type,
		block.name ?? "",
		block.enabled === false ? "0" : "1",
		JSON.stringify(block.subBlocks ?? {}),
	].join("");
}

/** A stable signature of all edges (order-independent). */
function edgesSignature(state: RoxWorkflowState): string {
	return state.edges
		.map((e) => `${e.source}>${e.target}:${e.sourceHandle ?? ""}`)
		.sort()
		.join("|");
}

/**
 * Whether `a` and `b` differ in anything other than node positions. Returns true
 * when block ids are added/removed, any block's non-position signature changes,
 * or the edge set changes. Position-only moves return false (no checkpoint).
 */
export function isStructuralChange(
	a: RoxWorkflowState,
	b: RoxWorkflowState,
): boolean {
	const aIds = Object.keys(a.blocks);
	const bIds = Object.keys(b.blocks);
	if (aIds.length !== bIds.length) return true;
	for (const id of aIds) {
		const ba = a.blocks[id];
		const bb = b.blocks[id];
		if (!bb || !ba) return true;
		if (blockSignature(ba) !== blockSignature(bb)) return true;
	}
	if (edgesSignature(a) !== edgesSignature(b)) return true;
	return false;
}
