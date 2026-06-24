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
	MiniMap,
	type Node,
	type NodeChange,
	type OnConnect,
	useEdgesState,
	useNodesState,
	useReactFlow,
} from "@rox/ui/ai-elements/flow";
import { Button } from "@rox/ui/button";
import type { RoxWorkflowState } from "@rox/workflow-core";
import { LayoutTemplate } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PipelineFlowEdge, PipelineFlowNode } from "../graph-adapter";
import { NodePalette, PALETTE_DND_MIME } from "../NodePalette";
import { PIPELINE_EDGE_TYPES, PIPELINE_NODE_TYPES } from "../nodes";
import { TemplateGallery } from "../TemplateGallery";
import { miniMapColorForType } from "./miniMapColor";

/** New edges are branch-coloured + arrow-tipped (default `out` branch). */
const NEW_EDGE_DEFAULTS = {
	type: "branch",
	data: { branch: "out" },
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
	/** Project scope for the palette's role list. */
	v2ProjectId?: string;
	onSelectNode: (nodeId: string | null) => void;
	/** Called (debounced by the parent) whenever nodes/edges change. */
	onGraphChange: (nodes: PipelineFlowNode[], edges: PipelineFlowEdge[]) => void;
	/** Add a node of the given registry type (optionally bound + positioned). */
	onAddNode: (
		type: string,
		opts?: {
			roleSlug?: string;
			label?: string;
			position?: { x: number; y: number };
		},
	) => void;
	/** Replace the working graph with a template's graph. */
	onApplyTemplate: (next: RoxWorkflowState) => void;
};

/**
 * The interactive pipeline canvas. A left dock palette (categorized, searchable,
 * drag-n-drop) adds nodes; the canvas renders registry-driven nodes with typed
 * ports and branch-coloured edges; a MiniMap (tinted by registry category) and
 * zoom controls aid navigation; a templates gallery seeds whole graphs.
 *
 * Node/edge state is owned here via xyflow's controlled hooks; the parent passes
 * derived nodes/edges and receives change callbacks to persist back to
 * `RoxWorkflowState`. Cache-first (AGENTS.md #9): existing nodes always render;
 * an incoming external graph re-syncs only when its structural signature changes.
 */
export function PipelineCanvas({
	nodes: initialNodes,
	edges: initialEdges,
	selectedNodeId,
	v2ProjectId,
	onSelectNode,
	onGraphChange,
	onAddNode,
	onApplyTemplate,
}: PipelineCanvasProps) {
	const [nodes, setNodes] = useNodesState<PipelineFlowNode>(initialNodes);
	const [edges, setEdges] = useEdgesState<PipelineFlowEdge>(initialEdges);
	const [galleryOpen, setGalleryOpen] = useState(false);
	const { screenToFlowPosition } = useReactFlow();

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
			// Carry the source branch handle so the edge colours/labels correctly.
			const branch = connection.sourceHandle ?? "out";
			const next = addEdge(
				{ ...connection, ...NEW_EDGE_DEFAULTS, data: { branch } },
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

	// Drag-n-drop add: drop a palette entry to create a node at the drop point.
	const handleDragOver = useCallback((event: React.DragEvent) => {
		if (event.dataTransfer.types.includes(PALETTE_DND_MIME)) {
			event.preventDefault();
			event.dataTransfer.dropEffect = "copy";
		}
	}, []);

	const handleDrop = useCallback(
		(event: React.DragEvent) => {
			const raw = event.dataTransfer.getData(PALETTE_DND_MIME);
			if (!raw) return;
			event.preventDefault();
			let payload: { type?: string; roleSlug?: string; label?: string };
			try {
				payload = JSON.parse(raw);
			} catch {
				return;
			}
			if (!payload.type) return;
			const position = screenToFlowPosition({
				x: event.clientX,
				y: event.clientY,
			});
			onAddNode(payload.type, {
				roleSlug: payload.roleSlug,
				label: payload.label,
				position,
			});
		},
		[onAddNode, screenToFlowPosition],
	);

	return (
		<div className="flex h-full">
			<NodePalette v2ProjectId={v2ProjectId} onAddNode={onAddNode} />
			{/* The canvas drop surface — the interactive widget is the xyflow
			    <Canvas> inside; this wrapper relays palette drag-n-drop to add a
			    node at the cursor (role=application so it's not a "static" element). */}
			<div
				className="relative min-w-0 flex-1"
				role="application"
				aria-label="Холст пайплайна"
				onDragOver={handleDragOver}
				onDrop={handleDrop}
			>
				<Canvas
					nodes={decoratedNodes as Node[]}
					edges={edges as Edge[]}
					nodeTypes={PIPELINE_NODE_TYPES}
					edgeTypes={PIPELINE_EDGE_TYPES}
					// The canvas primitive defaults its node/edge generics to the base
					// xyflow types; our change handlers are typed against the concrete
					// pipeline node (a structural subtype), so we cast at the prop boundary.
					onNodesChange={
						handleNodesChange as (changes: NodeChange<Node>[]) => void
					}
					onEdgesChange={
						handleEdgesChange as (changes: EdgeChange<Edge>[]) => void
					}
					onConnect={handleConnect}
					onNodeClick={handleNodeClick}
					onPaneClick={handlePaneClick}
				>
					<Controls showInteractive={false} />
					<MiniMap
						pannable
						zoomable
						className="!bottom-3 !right-3 rounded-md border bg-card/80 backdrop-blur"
						nodeColor={(node) =>
							miniMapColorForType(
								(node.data as { blockType?: string })?.blockType,
							)
						}
						nodeStrokeWidth={2}
						maskColor="color-mix(in oklab, var(--sidebar) 70%, transparent)"
					/>
				</Canvas>

				{/* Templates gallery trigger (top-right). */}
				<div className="pointer-events-none absolute right-3 top-3 z-10">
					<Button
						size="sm"
						variant="secondary"
						className="pointer-events-auto shadow-sm"
						onClick={() => setGalleryOpen(true)}
					>
						<LayoutTemplate className="size-3.5" /> Шаблоны
					</Button>
				</div>

				<TemplateGallery
					open={galleryOpen}
					onOpenChange={setGalleryOpen}
					onInsert={(state) => {
						onApplyTemplate(state);
						setGalleryOpen(false);
					}}
				/>
			</div>
		</div>
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
		.map((e) => `${e.source}->${e.target}:${e.sourceHandle ?? ""}`)
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
