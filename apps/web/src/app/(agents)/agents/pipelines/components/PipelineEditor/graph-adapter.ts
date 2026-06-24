/**
 * Pure adapters between the persisted pipeline graph (`RoxWorkflowState`, the
 * jsonb on `workflow_definitions.draftState`) and the `@xyflow/react` node/edge
 * model the canvas renders.
 *
 * Keeping this conversion pure (no React, no xyflow runtime — only its value
 * types) means it is unit-testable in isolation and shared by every canvas
 * surface. The canvas owns layout via `RoxBlockState.position`; round-tripping
 * preserves positions, names, and per-block subBlocks/metadata.
 */

import type { Edge, Node } from "@rox/ui/ai-elements/flow";
import {
	getNodeType,
	listNodeTypes,
	type RoxBlockState,
	type RoxEdge,
	type RoxWorkflowState,
} from "@rox/workflow-core";

/**
 * Canvas node kinds with a dedicated xyflow renderer in this slice. The registry
 * may know many more node types; until each category gets its own renderer
 * (canvas slice), any other registered (or legacy) type is rendered with the
 * generic `agent_run` node body. The persisted `RoxBlockState.type` is preserved
 * losslessly regardless (see `toBlockType`).
 */
export type PipelineNodeKind =
	| "start"
	| "agent_run"
	| "human_approval"
	| "loop"
	| "response";

/**
 * Data carried on each xyflow node; mirrors the block it represents. The index
 * signature satisfies xyflow's `Node<NodeData extends Record<string, unknown>>`
 * constraint.
 */
export type PipelineNodeData = {
	/** The block id (stable graph key). */
	blockId: string;
	/** Canvas node kind. */
	kind: PipelineNodeKind;
	/** Persisted workflow block type. Can be broader than the rendered kind. */
	blockType: string;
	/** Human-facing label. */
	label: string;
	/** Role skill slug bound to an `agent_run` node (if chosen yet). */
	roleSlug?: string;
	/** Free-form per-block config (sub-blocks / field values). */
	subBlocks?: Record<string, unknown>;
	/** Whether the block is disabled (skipped at runtime). */
	enabled?: boolean;
	[key: string]: unknown;
};

export type PipelineFlowNode = Node<PipelineNodeData>;
export type PipelineFlowEdge = Edge;

/** Node kinds with a dedicated renderer in this slice. */
const RENDERABLE_KINDS: ReadonlySet<string> = new Set<PipelineNodeKind>([
	"start",
	"agent_run",
	"human_approval",
	"loop",
	"response",
]);

/**
 * Coerce a persisted block type to a renderable canvas node kind. A type with a
 * dedicated renderer keeps it; any other registered or legacy type falls back to
 * the generic `agent_run` node body (the persisted type is preserved separately).
 */
function toNodeKind(type: string): PipelineNodeKind {
	return (RENDERABLE_KINDS.has(type) ? type : "agent_run") as PipelineNodeKind;
}

function blockLabel(block: RoxBlockState, fallbackId: string): string {
	if (block.name && block.name.trim().length > 0) return block.name;
	return fallbackId;
}

/** Read the role slug from an agent_run block's subBlocks, if present. */
export function readRoleSlug(block: RoxBlockState): string | undefined {
	const raw = block.subBlocks?.roleSlug;
	return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/** A node type the user can add from the palette/toolbar. */
export type AddableNodeType = {
	/** Registry node-type id (becomes `RoxBlockState.type`). */
	id: string;
	/** RU label for the palette entry + default node name. */
	label: string;
	/** Palette category id. */
	category: string;
	/** Lucide icon name for the palette entry. */
	icon: string;
	/** Tailwind icon colour class. */
	iconClass: string;
};

/**
 * The node types the toolbar/palette can add, sourced from the registry (skipping
 * singletons like `start`). Replaces the hard-coded toolbar list so adding a
 * registry module surfaces it in the palette automatically.
 */
export function addableNodeTypes(): AddableNodeType[] {
	return listNodeTypes()
		.filter((def) => !def.singleton)
		.map((def) => ({
			id: def.id,
			label: def.label,
			category: def.category,
			icon: def.render.icon,
			iconClass: def.render.iconClass,
		}));
}

/** Default node name for a freshly-added type (registry label, then the id). */
export function defaultLabelForType(type: string): string {
	return getNodeType(type)?.label ?? type;
}

// ---------------------------------------------------------------------------
// state -> xyflow
// ---------------------------------------------------------------------------

/** Convert a persisted graph into xyflow nodes. */
export function stateToNodes(state: RoxWorkflowState): PipelineFlowNode[] {
	return Object.entries(state.blocks).map(([blockId, block], index) => {
		const kind = toNodeKind(block.type);
		const position = block.position ?? {
			// Lay unplaced blocks out in a readable cascade.
			x: 120 + (index % 4) * 280,
			y: 120 + Math.floor(index / 4) * 200,
		};
		return {
			id: blockId,
			type: kind === "start" ? "pipelineStart" : `pipeline_${kind}`,
			position,
			data: {
				blockId,
				kind,
				blockType: block.type,
				label: blockLabel(block, blockId),
				roleSlug: readRoleSlug(block),
				subBlocks: block.subBlocks,
				enabled: block.enabled,
			},
		} satisfies PipelineFlowNode;
	});
}

/** Convert persisted edges into xyflow edges (animated when valid). */
export function stateToEdges(state: RoxWorkflowState): PipelineFlowEdge[] {
	return state.edges.map((edge, index) => ({
		id: edge.id ?? `${edge.source}->${edge.target}-${index}`,
		source: edge.source,
		target: edge.target,
		sourceHandle: edge.sourceHandle ?? null,
		targetHandle: edge.targetHandle ?? null,
		type: "animated",
	}));
}

// ---------------------------------------------------------------------------
// xyflow -> state
// ---------------------------------------------------------------------------

/** Preserve broader persisted block types when the canvas is only rendering them. */
function toBlockType(data: PipelineNodeData): string {
	return data.blockType || data.kind;
}

/**
 * Fold the current canvas nodes + edges back into a `RoxWorkflowState`,
 * preserving the prior state's variables / loops / parallels / metadata (the
 * canvas only edits blocks + edges + positions).
 */
export function flowToState(
	prev: RoxWorkflowState,
	nodes: PipelineFlowNode[],
	edges: PipelineFlowEdge[],
): RoxWorkflowState {
	const blocks: Record<string, RoxBlockState> = {};
	for (const node of nodes) {
		const data = node.data;
		const subBlocks: Record<string, unknown> = { ...(data.subBlocks ?? {}) };
		if (data.roleSlug) {
			subBlocks.roleSlug = data.roleSlug;
		} else {
			delete subBlocks.roleSlug;
		}
		blocks[data.blockId] = {
			type: toBlockType(data),
			name: data.label,
			enabled: data.enabled,
			position: { x: node.position.x, y: node.position.y },
			subBlocks: Object.keys(subBlocks).length > 0 ? subBlocks : undefined,
			metadata: prev.blocks[data.blockId]?.metadata,
		};
	}

	const nextEdges: RoxEdge[] = edges.map((edge) => ({
		id: edge.id,
		source: edge.source,
		target: edge.target,
		sourceHandle: edge.sourceHandle ?? undefined,
		targetHandle: edge.targetHandle ?? undefined,
	}));

	return {
		id: prev.id,
		blocks,
		edges: nextEdges,
		variables: prev.variables,
		loops: prev.loops,
		parallels: prev.parallels,
		metadata: prev.metadata,
	};
}
