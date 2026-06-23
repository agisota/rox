/**
 * Pure helpers for bounded re-entrant loop walking and node-entry execution.
 *
 * Feedback loops (e.g. `critic → improver`) are stored in
 * {@link RoxWorkflowState.loops} as `{ nodes, maxIterations? }`. The forward edge
 * set is a DAG so {@link validateGraph} / {@link topologicalSort} stay acyclic;
 * the loop's *back-edge* (the edge that re-enters the loop entry) is what makes
 * the cycle. This module identifies those back-edges and the loop entry node so
 * the executor can (a) strip back-edges before planning and (b) walk the loop
 * body a bounded number of times.
 *
 * Everything here is deterministic, DB-free, and side-effect-free.
 */

import type { RoxEdge, RoxWorkflowState } from "../types";

/** A resolved loop: its entry node, body nodes, and the back-edge(s) into entry. */
export interface ResolvedLoop {
	/** The loop id (key in `state.loops`). */
	loopId: string;
	/** The node the loop re-enters on each iteration (lowest-topo body node). */
	entryNodeId: string;
	/** All body node ids belonging to this loop (as declared). */
	bodyNodeIds: string[];
	/** Edges internal to the loop whose target is the entry node (the back-edges). */
	backEdges: RoxEdge[];
}

/** Stable edge identity for back-edge lookups (id when present, else endpoints+handle). */
export function edgeKey(edge: RoxEdge): string {
	if (edge.id != null) return edge.id;
	return `${edge.source} ${edge.target} ${edge.sourceHandle ?? ""}`;
}

/**
 * Resolve the entry node of a loop body: the body node with at least one edge
 * coming from *outside* the body (the loop's forward entry point). When several
 * qualify, the lexicographically smallest id wins for determinism. Falls back to
 * the smallest body id when no external in-edge exists (a self-contained loop).
 */
function resolveLoopEntry(
	state: RoxWorkflowState,
	bodySet: Set<string>,
): string | undefined {
	if (bodySet.size === 0) return undefined;
	const externallyEntered = new Set<string>();
	for (const edge of state.edges) {
		if (bodySet.has(edge.target) && !bodySet.has(edge.source)) {
			externallyEntered.add(edge.target);
		}
	}
	const candidates = (
		externallyEntered.size > 0 ? [...externallyEntered] : [...bodySet]
	).sort();
	return candidates[0];
}

/**
 * Resolve every declared loop into its entry node + back-edges. A back-edge is an
 * edge whose source and target are both inside the loop body and whose target is
 * the loop entry — i.e. the edge that closes the cycle by re-entering the loop.
 *
 * Loops with fewer than one body node, or no detectable back-edge, are skipped
 * (they contribute nothing to iterate and are handled by the normal DAG walk).
 */
export function resolveLoops(state: RoxWorkflowState): ResolvedLoop[] {
	const resolved: ResolvedLoop[] = [];
	for (const loopId of Object.keys(state.loops).sort()) {
		const loop = state.loops[loopId];
		if (!loop) continue;
		const bodyNodeIds = loop.nodes.filter((id) => id in state.blocks);
		if (bodyNodeIds.length === 0) continue;
		const bodySet = new Set(bodyNodeIds);
		const entryNodeId = resolveLoopEntry(state, bodySet);
		if (entryNodeId == null) continue;
		const backEdges = state.edges.filter(
			(e) =>
				bodySet.has(e.source) &&
				bodySet.has(e.target) &&
				e.target === entryNodeId,
		);
		if (backEdges.length === 0) continue;
		resolved.push({ loopId, entryNodeId, bodyNodeIds, backEdges });
	}
	return resolved;
}

/**
 * The set of loop back-edge keys across all resolved loops. The executor strips
 * these edges before validating/planning so the forward graph is acyclic, then
 * consults them at runtime to decide loop re-entry.
 */
export function loopBackEdgeKeys(loops: ResolvedLoop[]): Set<string> {
	const keys = new Set<string>();
	for (const loop of loops) {
		for (const edge of loop.backEdges) keys.add(edgeKey(edge));
	}
	return keys;
}

/**
 * Return a copy of the workflow state with all loop back-edges removed, so the
 * remaining forward edges form a DAG. Blocks/loops/etc. are shared by reference
 * (we only rewrite the `edges` array); callers must not mutate the result.
 */
export function stripLoopBackEdges(
	state: RoxWorkflowState,
	backEdgeKeys: Set<string>,
): RoxWorkflowState {
	if (backEdgeKeys.size === 0) return state;
	return {
		...state,
		edges: state.edges.filter((e) => !backEdgeKeys.has(edgeKey(e))),
	};
}
