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
 * Canvas node kinds with a dedicated (legacy) xyflow renderer — the five types
 * that already executed before the registry landed. Every OTHER registered (or
 * unknown/legacy) type renders through the generic, registry-driven
 * `RegistryNode` (`pipelineRegistry`) so the whole node catalog is styled from
 * the registry without a per-type component. The persisted `RoxBlockState.type`
 * is preserved losslessly regardless (see `toBlockType`).
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
	/**
	 * Live run-trace status for this block during an active pipeline run
	 * (`running`/`succeeded`/`failed`/`waiting_approval`/`pending`). Set by the
	 * editor from polled `getRun` steps; absent when no run is active.
	 */
	runStatus?: string;
	[key: string]: unknown;
};

export type PipelineFlowNode = Node<PipelineNodeData>;
export type PipelineFlowEdge = Edge;

/** Node types with a dedicated (legacy) renderer; everything else is generic. */
const DEDICATED_KINDS: ReadonlySet<string> = new Set<PipelineNodeKind>([
	"start",
	"agent_run",
	"human_approval",
	"loop",
	"response",
]);

/** Whether a persisted block type has its own dedicated xyflow renderer. */
export function hasDedicatedRenderer(type: string): boolean {
	return DEDICATED_KINDS.has(type);
}

/**
 * Coerce a persisted block type to a canvas node kind for the `data.kind` hint.
 * A dedicated type keeps its kind; everything else (catalog + legacy) is tagged
 * `agent_run` for back-compat consumers while it actually renders through the
 * generic `RegistryNode` (the persisted type is preserved separately).
 */
function toNodeKind(type: string): PipelineNodeKind {
	return (DEDICATED_KINDS.has(type) ? type : "agent_run") as PipelineNodeKind;
}

/**
 * The xyflow node-type key for a persisted block: a dedicated `pipeline_*` key
 * for the five legacy types, otherwise the generic `pipelineRegistry` renderer.
 */
export function nodeTypeForBlock(type: string): string {
	if (!DEDICATED_KINDS.has(type)) return "pipelineRegistry";
	return type === "start" ? "pipelineStart" : `pipeline_${type}`;
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
			type: nodeTypeForBlock(block.type),
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

/**
 * Resolve a human-facing branch label for an edge from the source block's
 * registry out-port (e.g. `true` → «Истина»). Returns undefined for a plain
 * `out`/unhandled port so the edge renders unlabeled.
 */
export function branchLabelFor(
	state: RoxWorkflowState,
	sourceBlockId: string,
	sourceHandle: string | null | undefined,
): string | undefined {
	if (!sourceHandle || sourceHandle === "out") return undefined;
	const sourceType = state.blocks[sourceBlockId]?.type;
	const def = sourceType ? getNodeType(sourceType) : undefined;
	const port = def?.outputs.find((p) => p.name === sourceHandle);
	return port?.label ?? sourceHandle;
}

/**
 * Convert persisted edges into xyflow `branch` edges — coloured by the source
 * out-port tone and labelled for named branches. The branch handle id and label
 * ride on the edge so {@link BranchEdge} can colour/label without re-deriving.
 */
export function stateToEdges(state: RoxWorkflowState): PipelineFlowEdge[] {
	return state.edges.map((edge, index) => {
		const branch = edge.sourceHandle ?? "out";
		const label = branchLabelFor(state, edge.source, edge.sourceHandle);
		return {
			id: edge.id ?? `${edge.source}->${edge.target}-${index}`,
			source: edge.source,
			target: edge.target,
			sourceHandle: edge.sourceHandle ?? null,
			targetHandle: edge.targetHandle ?? null,
			type: "branch",
			data: { branch, ...(label ? { label } : {}) },
		};
	});
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
