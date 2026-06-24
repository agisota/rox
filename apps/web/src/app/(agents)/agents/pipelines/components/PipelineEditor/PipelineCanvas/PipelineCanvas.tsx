"use client";

import { Canvas } from "@rox/ui/ai-elements/canvas";
import { Controls } from "@rox/ui/ai-elements/controls";
import {
	addEdge,
	applyEdgeChanges,
	applyNodeChanges,
	type Connection,
	type Edge,
	type EdgeChange,
	MarkerType,
	type Node,
	type NodeChange,
	type OnConnect,
	useEdgesState,
	useNodesState,
} from "@rox/ui/ai-elements/flow";
import { Panel } from "@rox/ui/ai-elements/panel";
import { Button } from "@rox/ui/button";
import {
	Bot,
	Box,
	Flag,
	type LucideIcon,
	Plus,
	Repeat,
	ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
	addableNodeTypes,
	type PipelineFlowEdge,
	type PipelineFlowNode,
} from "../graph-adapter";
import { PIPELINE_EDGE_TYPES, PIPELINE_NODE_TYPES } from "../nodes";

/** Lucide lookup for palette icons (registry `render.icon`), with a fallback. */
const PALETTE_ICONS: Record<string, LucideIcon> = {
	Bot,
	Repeat,
	ShieldCheck,
	Flag,
	Box,
};

const ANIMATED_EDGE_DEFAULTS = {
	type: "animated",
	markerEnd: { type: MarkerType.ArrowClosed },
} as const;

export type PipelineCanvasHandle = {
	getNodes: () => PipelineFlowNode[];
	getEdges: () => PipelineFlowEdge[];
};

type PipelineCanvasProps = {
	/** xyflow nodes derived from the persisted graph. */
	nodes: PipelineFlowNode[];
	/** xyflow edges derived from the persisted graph. */
	edges: PipelineFlowEdge[];
	/** Currently-selected node id (for panel sync). */
	selectedNodeId: string | null;
	onSelectNode: (nodeId: string | null) => void;
	/** Called (debounced by the parent) whenever nodes/edges change. */
	onGraphChange: (nodes: PipelineFlowNode[], edges: PipelineFlowEdge[]) => void;
	/** Add a node of the given registry type at a default position. */
	onAddNode: (type: string) => void;
};

/**
 * The interactive pipeline canvas: draggable agent-role/loop/approval nodes,
 * connectable edges, selection, and live graph-change notifications. Wires the
 * unused `@rox/ui/ai-elements` xyflow primitives (Canvas / Controls / Panel /
 * Node / Edge) to the Agent Pipelines graph model.
 *
 * Node/edge state is owned here via xyflow's controlled hooks; the parent passes
 * derived nodes/edges and receives change callbacks to persist back to
 * `RoxWorkflowState`.
 */
export function PipelineCanvas({
	nodes: initialNodes,
	edges: initialEdges,
	selectedNodeId,
	onSelectNode,
	onGraphChange,
	onAddNode,
}: PipelineCanvasProps) {
	const [nodes, setNodes] = useNodesState<PipelineFlowNode>(initialNodes);
	const [edges, setEdges] = useEdgesState<PipelineFlowEdge>(initialEdges);

	// Keep a ref to the latest graph so the parent can read it on demand (save).
	const latest = useRef({ nodes, edges });
	latest.current = { nodes, edges };

	// Re-sync when the persisted graph identity changes (e.g. template applied,
	// pipeline switched). We compare by a structural signature so local drags
	// don't clobber in-progress edits.
	const incomingSignature = useMemo(
		() => signatureOf(initialNodes, initialEdges),
		[initialNodes, initialEdges],
	);
	const appliedSignature = useRef(incomingSignature);
	useEffect(() => {
		if (incomingSignature !== appliedSignature.current) {
			appliedSignature.current = incomingSignature;
			setNodes(initialNodes);
			setEdges(initialEdges);
		}
	}, [incomingSignature, initialNodes, initialEdges, setNodes, setEdges]);

	// Mark selection on the nodes so custom renderers can show the ring.
	const decoratedNodes = useMemo(
		() =>
			nodes.map((node) => ({
				...node,
				selected: node.id === selectedNodeId,
			})),
		[nodes, selectedNodeId],
	);

	const handleConnect = useCallback<OnConnect>(
		(connection: Connection) => {
			const next = addEdge(
				{ ...connection, ...ANIMATED_EDGE_DEFAULTS },
				latest.current.edges,
			) as PipelineFlowEdge[];
			latest.current = { nodes: latest.current.nodes, edges: next };
			setEdges(next);
			onGraphChange(latest.current.nodes, next);
		},
		[setEdges, onGraphChange],
	);

	const handleNodesChange = useCallback(
		(changes: NodeChange<PipelineFlowNode>[]) => {
			const shouldPersist = hasStructuralNodeChanges(changes);
			const next = applyNodeChanges(
				changes,
				latest.current.nodes,
			) as PipelineFlowNode[];
			latest.current = { nodes: next, edges: latest.current.edges };
			setNodes(next);
			if (shouldPersist) {
				onGraphChange(next, latest.current.edges);
			}
		},
		[setNodes, onGraphChange],
	);

	const handleEdgesChange = useCallback(
		(changes: EdgeChange<PipelineFlowEdge>[]) => {
			const shouldPersist = hasStructuralEdgeChanges(changes);
			const next = applyEdgeChanges(
				changes,
				latest.current.edges,
			) as PipelineFlowEdge[];
			latest.current = { nodes: latest.current.nodes, edges: next };
			setEdges(next);
			if (shouldPersist) {
				onGraphChange(latest.current.nodes, next);
			}
		},
		[setEdges, onGraphChange],
	);

	const handleNodeClick = useCallback(
		(_event: React.MouseEvent, node: Node) => {
			onSelectNode(node.id);
		},
		[onSelectNode],
	);

	const handlePaneClick = useCallback(() => {
		onSelectNode(null);
	}, [onSelectNode]);

	// Toolbar entries from the registry (excludes singletons like `start`).
	const palette = useMemo(() => addableNodeTypes(), []);

	return (
		<Canvas
			nodes={decoratedNodes as Node[]}
			edges={edges as Edge[]}
			nodeTypes={PIPELINE_NODE_TYPES}
			edgeTypes={PIPELINE_EDGE_TYPES}
			// The canvas primitive defaults its node/edge generics to the base xyflow
			// types; our change handlers are typed against the concrete pipeline node
			// (a structural subtype), so we cast at the prop boundary.
			onNodesChange={handleNodesChange as (changes: NodeChange<Node>[]) => void}
			onEdgesChange={handleEdgesChange as (changes: EdgeChange<Edge>[]) => void}
			onConnect={handleConnect}
			onNodeClick={handleNodeClick}
			onPaneClick={handlePaneClick}
		>
			<Controls showInteractive={false} />
			<Panel position="top-left" className="flex flex-wrap gap-1">
				{palette.map((entry) => {
					const Icon = PALETTE_ICONS[entry.icon] ?? Plus;
					return (
						<Button
							key={entry.id}
							size="sm"
							variant="ghost"
							onClick={() => onAddNode(entry.id)}
						>
							<Icon className={`size-3.5 ${entry.iconClass}`} /> {entry.label}
						</Button>
					);
				})}
			</Panel>
		</Canvas>
	);
}

/** Structural signature used to detect when an externally-provided graph changes. */
function signatureOf(
	nodes: PipelineFlowNode[],
	edges: PipelineFlowEdge[],
): string {
	const nodePart = nodes
		.map((n) => `${n.id}:${n.type}:${n.data.roleSlug ?? ""}`)
		.sort()
		.join("|");
	const edgePart = edges
		.map((e) => `${e.source}->${e.target}`)
		.sort()
		.join("|");
	return `${nodePart}##${edgePart}`;
}

function hasStructuralNodeChanges(
	changes: NodeChange<PipelineFlowNode>[],
): boolean {
	return changes.some((change) =>
		["add", "position", "remove", "replace"].includes(change.type),
	);
}

function hasStructuralEdgeChanges(
	changes: EdgeChange<PipelineFlowEdge>[],
): boolean {
	return changes.some((change) =>
		["add", "remove", "replace"].includes(change.type),
	);
}
