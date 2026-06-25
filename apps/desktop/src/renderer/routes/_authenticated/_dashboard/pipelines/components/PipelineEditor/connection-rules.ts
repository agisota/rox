/**
 * Typed-port connection guard for the canvas (`isValidConnection`).
 *
 * Pure predicate over the current nodes/edges and the proposed connection, so it
 * is unit-testable and shared by the canvas drag guard and the temporary-edge
 * colouring. Mirrors dify's edge rules: no self-loop, no edge *into* the start
 * node, no duplicate edge between the same source-handle→target pair — and now
 * rejects a wire whose source out-port type is incompatible with the target
 * in-port type (mirrors `validateGraph`'s `INCOMPATIBLE_PORT_TYPES`, sharing the
 * same `arePortTypesCompatible` rule so the canvas and persistence agree).
 */

import { arePortTypesCompatible, getNodeType } from "@rox/workflow-core";
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
 *   source may still fan out from two *different* handles),
 * - the source out-port type and target in-port type are incompatible (two
 *   differing concrete types; `any`/untyped ports stay compatible).
 */
export function canConnect(
	connection: ConnectionLike,
	nodes: PipelineFlowNode[],
	edges: PipelineFlowEdge[],
): boolean {
	const { source, target } = connection;
	if (!source || !target) return false;
	if (source === target) return false;

	const sourceNode = nodes.find((n) => n.id === source);
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

	if (!arePortsTypeCompatible(connection, sourceNode, targetNode)) return false;

	return true;
}

/**
 * Whether the proposed connection's source out-port type is compatible with its
 * target in-port type. Resolves both ports from the registry by the node's
 * persisted `blockType` (falling back to the canvas `kind`); when either type is
 * unregistered or the port is unknown the wire is allowed (additive — the
 * persisted-graph validator does the same). `any`/untyped ports stay compatible.
 */
function arePortsTypeCompatible(
	connection: ConnectionLike,
	sourceNode: PipelineFlowNode | undefined,
	targetNode: PipelineFlowNode | undefined,
): boolean {
	if (!sourceNode || !targetNode) return true;
	const sourceDef =
		getNodeType(sourceNode.data.blockType) ?? getNodeType(sourceNode.data.kind);
	const targetDef =
		getNodeType(targetNode.data.blockType) ?? getNodeType(targetNode.data.kind);
	if (!sourceDef || !targetDef) return true;

	const outName = connection.sourceHandle ?? "out";
	const outPort = sourceDef.outputs.find((p) => p.name === outName);
	const inName = connection.targetHandle;
	const inPort = inName
		? targetDef.inputs.find((p) => p.name === inName)
		: targetDef.inputs[0];
	if (!outPort || !inPort) return true;

	return arePortTypesCompatible(outPort.type, inPort.type);
}
