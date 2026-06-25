/**
 * Directed-graph auto-layout for the pipeline canvas, powered by `@dagrejs/dagre`
 * (MIT). Produces a left-to-right layered layout matching dify's
 * `use-nodes-layout` constants (rank direction RIGHT, ~60px between layers,
 * ~40px node spacing), then writes the computed x/y back into each block's
 * `position` so the existing graph-adapter round-trips them.
 *
 * Pure (no React, no xyflow) → unit-testable. The canvas only animates the
 * transition; the maths lives here. validateGraph guarantees acyclicity for a
 * valid pipeline, but dagre tolerates cycles too, so an invalid graph still lays
 * out sensibly.
 */

import dagre from "@dagrejs/dagre";
import type { RoxWorkflowState } from "@rox/workflow-core";

/** Approx node footprint used for layout (matches the dify NODE_WIDTH family). */
const NODE_WIDTH = 260;
const NODE_HEIGHT = 96;
/** Gap between layers (rank) and between siblings within a layer — dify-ish. */
const RANK_SEP = 80;
const NODE_SEP = 48;
/** Top-left origin so the laid-out graph doesn't start at the canvas edge. */
const ORIGIN = { x: 80, y: 80 };

/**
 * Lay the graph out left-to-right and return a new state with every block's
 * `position` set. Blocks with no edges still get a slot (dagre places isolated
 * nodes in their own rank). Returns the same reference when there are no blocks.
 */
export function autoLayoutGraph(state: RoxWorkflowState): RoxWorkflowState {
	const ids = Object.keys(state.blocks);
	if (ids.length === 0) return state;

	const g = new dagre.graphlib.Graph();
	g.setGraph({
		rankdir: "LR",
		ranksep: RANK_SEP,
		nodesep: NODE_SEP,
		marginx: ORIGIN.x,
		marginy: ORIGIN.y,
	});
	g.setDefaultEdgeLabel(() => ({}));

	for (const id of ids) {
		g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
	}
	for (const edge of state.edges) {
		// Skip edges that reference a missing endpoint (dagre would throw).
		if (state.blocks[edge.source] && state.blocks[edge.target]) {
			g.setEdge(edge.source, edge.target);
		}
	}

	dagre.layout(g);

	const nextBlocks: RoxWorkflowState["blocks"] = {};
	for (const id of ids) {
		const node = g.node(id);
		const block = state.blocks[id];
		if (!block) continue;
		// dagre reports the node *centre*; xyflow positions are top-left.
		nextBlocks[id] = node
			? {
					...block,
					position: {
						x: Math.round(node.x - NODE_WIDTH / 2),
						y: Math.round(node.y - NODE_HEIGHT / 2),
					},
				}
			: block;
	}

	return { ...state, blocks: nextBlocks };
}
