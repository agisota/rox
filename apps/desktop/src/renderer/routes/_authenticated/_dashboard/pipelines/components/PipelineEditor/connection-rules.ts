/**
 * Typed-port connection guard for the canvas (`isValidConnection`).
 *
 * Pure predicate over the current nodes/edges and the proposed connection, so it
 * is unit-testable and shared by the canvas drag guard and the temporary-edge
 * colouring. Mirrors dify's edge rules: no self-loop, no edge *into* the start
 * node, no duplicate edge between the same source-handle→target pair.
 */

import type { PipelineFlowEdge, PipelineFlowNode } from "./graph-adapter";

/** A minimal connection shape (xyflow `Connection` is a structural superset). */
export type ConnectionLike = {
	source: string | null;
	target: string | null;
	sourceHandle?: string | null;
	targetHandle?: string | null;
};

/**
 * Whether `connection` may be added to the graph.
 *
 * Rejects when:
 * - source or target is missing,
 * - source === target (self-loop),
 * - the target is the (source-only) start node — nothing flows *into* start,
 * - an edge with the same source + sourceHandle + target already exists
 *   (duplicate; branch ports are distinguished by sourceHandle, so the same
 *   source may still fan out from two *different* handles).
 */
export function canConnect(
	connection: ConnectionLike,
	nodes: PipelineFlowNode[],
	edges: PipelineFlowEdge[],
): boolean {
	const { source, target } = connection;
	if (!source || !target) return false;
	if (source === target) return false;

	const targetNode = nodes.find((n) => n.id === target);
	// Start nodes are source-only; never allow an inbound edge.
	if (targetNode?.data.kind === "start") return false;

	const sourceHandle = connection.sourceHandle ?? null;
	const duplicate = edges.some(
		(edge) =>
			edge.source === source &&
			edge.target === target &&
			(edge.sourceHandle ?? null) === sourceHandle,
	);
	if (duplicate) return false;

	return true;
}
