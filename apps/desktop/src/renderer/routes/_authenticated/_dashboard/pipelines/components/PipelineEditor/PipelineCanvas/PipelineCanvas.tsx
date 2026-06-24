import { Canvas } from "@rox/ui/ai-elements/canvas";
import { Connection as TemporaryConnectionLine } from "@rox/ui/ai-elements/connection";
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
	useReactFlow,
} from "@rox/ui/ai-elements/flow";
import { Panel } from "@rox/ui/ai-elements/panel";
import { Button } from "@rox/ui/button";
import { Background, BackgroundVariant, MiniMap } from "@xyflow/react";
import { Plus, Sparkles, Wand2 } from "lucide-react";
import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import { canConnect } from "../connection-rules";
import type {
	PipelineFlowEdge,
	PipelineFlowNode,
	PipelineNodeKind,
} from "../graph-adapter";
import { isNodeDrag, readNodeDragData } from "../node-drag";
import { miniMapColorForNodeType } from "../node-kinds";
import { PIPELINE_EDGE_TYPES, PIPELINE_NODE_TYPES } from "../nodes";

const ANIMATED_EDGE_DEFAULTS = {
	type: "animated",
	markerEnd: { type: MarkerType.ArrowClosed },
} as const;

/** Imperative handle the editor uses to fit/centre after an auto-layout. */
export type PipelineCanvasHandle = {
	fitView: () => void;
	/** Flow coordinates of the current viewport centre (palette drop target). */
	getViewportCenter: () => { x: number; y: number };
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
	/** Add a node of the given kind at a default position (toolbar fallback). */
	onAddNode: (kind: PipelineNodeKind) => void;
	/** Drop a node at a precise flow position (drag-from-palette). */
	onDropNode: (
		kind: PipelineNodeKind,
		position: { x: number; y: number },
		roleSlug?: string,
		label?: string,
	) => void;
	/** Open the cmdk add-node palette. */
	onOpenPalette: () => void;
	/** Run the dagre auto-layout. */
	onAutoLayout: () => void;
	/** Imperative handle (fitView / viewport centre). */
	handleRef: React.Ref<PipelineCanvasHandle>;
	/** Whether the canvas is empty apart from the start node (show hint overlay). */
	showEmptyHint: boolean;
	/**
	 * Monotonic counter the editor bumps to force a full canvas re-seed from
	 * `initialNodes`/`initialEdges` even when the structural signature is
	 * unchanged — used after an auto-layout (positions move but ids/edges don't),
	 * which must NOT be folded into the position-independent signature (that would
	 * clobber in-progress drags). Undo/redo also bumps this.
	 */
	reseedKey: number;
};

/**
 * The interactive pipeline canvas: draggable agent-role/loop/approval nodes,
 * connectable edges (with a typed-port guard), selection, drag-from-palette drop,
 * a MiniMap, a dotted background, and live graph-change notifications. Wires the
 * `@rox/ui/ai-elements` xyflow primitives to the Agent Pipelines graph model and
 * fills in the unused core pieces (MiniMap, Background dots, DnD,
 * isValidConnection, temporary connection line) per the dify/sim parity spec.
 */
export function PipelineCanvas({
	nodes: initialNodes,
	edges: initialEdges,
	selectedNodeId,
	onSelectNode,
	onGraphChange,
	onAddNode,
	onDropNode,
	onOpenPalette,
	onAutoLayout,
	handleRef,
	showEmptyHint,
	reseedKey,
}: PipelineCanvasProps) {
	const [nodes, setNodes] = useNodesState<PipelineFlowNode>(initialNodes);
	const [edges, setEdges] = useEdgesState<PipelineFlowEdge>(initialEdges);
	const flow = useReactFlow();
	const wrapperRef = useRef<HTMLDivElement>(null);

	// Keep a ref to the latest graph so the parent can read it on demand (save).
	const latest = useRef({ nodes, edges });
	latest.current = { nodes, edges };

	useImperativeHandle(
		handleRef,
		() => ({
			fitView: () => flow.fitView({ duration: 300, padding: 0.2 }),
			getViewportCenter: () => {
				const el = wrapperRef.current;
				const rect = el?.getBoundingClientRect();
				if (!rect) return { x: 0, y: 0 };
				return flow.screenToFlowPosition({
					x: rect.left + rect.width / 2,
					y: rect.top + rect.height / 2,
				});
			},
		}),
		[flow],
	);

	// Re-sync when the persisted graph identity changes (e.g. template applied,
	// pipeline switched). We compare by a structural signature that is
	// position-INDEPENDENT so a local node drag never re-seeds mid-gesture (the
	// drag is already reflected via handleNodesChange). Position-moving operations
	// that must re-seed without a structural change (auto-layout, undo/redo) are
	// driven explicitly by `reseedKey` below.
	const incomingSignature = useMemo(
		() => signatureOf(initialNodes, initialEdges),
		[initialNodes, initialEdges],
	);
	const appliedSignature = useRef(incomingSignature);
	const appliedReseedKey = useRef(reseedKey);
	useEffect(() => {
		if (
			incomingSignature !== appliedSignature.current ||
			reseedKey !== appliedReseedKey.current
		) {
			appliedSignature.current = incomingSignature;
			appliedReseedKey.current = reseedKey;
			setNodes(initialNodes);
			setEdges(initialEdges);
		}
	}, [
		incomingSignature,
		reseedKey,
		initialNodes,
		initialEdges,
		setNodes,
		setEdges,
	]);

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
			// Colour the edge by its source branch handle (Да=emerald, body=sky, …).
			const stroke = edgeStrokeForHandle(connection.sourceHandle);
			const next = addEdge(
				{
					...connection,
					...ANIMATED_EDGE_DEFAULTS,
					...(stroke
						? {
								style: { stroke },
								markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
							}
						: {}),
				},
				latest.current.edges,
			) as PipelineFlowEdge[];
			latest.current = { nodes: latest.current.nodes, edges: next };
			setEdges(next);
			onGraphChange(latest.current.nodes, next);
		},
		[setEdges, onGraphChange],
	);

	// Typed-port guard: reject self-loops, edges into start, and duplicates.
	const isValidConnection = useCallback(
		(connection: Connection | Edge) =>
			canConnect(
				connection as Connection,
				latest.current.nodes,
				latest.current.edges,
			),
		[],
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

	// --- Drag-from-palette (native HTML DnD; @xyflow official pattern) ---------
	const handleDragOver = useCallback((event: React.DragEvent) => {
		if (!isNodeDrag(event)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
	}, []);

	const handleDrop = useCallback(
		(event: React.DragEvent) => {
			const payload = readNodeDragData(event);
			if (!payload) return;
			event.preventDefault();
			const position = flow.screenToFlowPosition({
				x: event.clientX,
				y: event.clientY,
			});
			onDropNode(payload.kind, position, payload.roleSlug, payload.label);
		},
		[flow, onDropNode],
	);

	return (
		<div ref={wrapperRef} className="relative h-full w-full">
			<Canvas
				nodes={decoratedNodes as Node[]}
				edges={edges as Edge[]}
				nodeTypes={PIPELINE_NODE_TYPES}
				edgeTypes={PIPELINE_EDGE_TYPES}
				connectionLineComponent={TemporaryConnectionLine}
				isValidConnection={isValidConnection}
				// The canvas primitive defaults its node/edge generics to the base xyflow
				// types; our change handlers are typed against the concrete pipeline node
				// (a structural subtype), so we cast at the prop boundary.
				onNodesChange={
					handleNodesChange as (changes: NodeChange<Node>[]) => void
				}
				onEdgesChange={
					handleEdgesChange as (changes: EdgeChange<Edge>[]) => void
				}
				onConnect={handleConnect}
				onNodeClick={handleNodeClick}
				onPaneClick={handlePaneClick}
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				aria-label="Холст пайплайна агентов"
			>
				{/*
				 * Dotted grid overlay (dify parity) on top of the solid sidebar
				 * background the Canvas primitive already renders. xyflow requires a
				 * unique `id` when more than one <Background> is stacked, else the SVG
				 * patterns collide.
				 */}
				<Background
					id="pipeline-dots"
					variant={BackgroundVariant.Dots}
					gap={14}
					size={2}
					className="opacity-60"
				/>
				<Controls showInteractive={false} />
				<MiniMap
					position="bottom-right"
					pannable
					zoomable
					nodeColor={(node) => miniMapColorForNodeType(node.type)}
					maskColor="rgba(10,10,10,0.6)"
					className="!bg-card/80 rounded-md border backdrop-blur"
					aria-label="Миникарта пайплайна"
				/>
				<Panel
					position="top-left"
					className="flex max-w-[min(42rem,calc(100vw-24rem))] flex-wrap items-center gap-1"
				>
					<Button
						size="sm"
						variant="default"
						aria-label="Добавить узел"
						onClick={onOpenPalette}
					>
						<Plus className="size-3.5" /> Добавить узел
					</Button>
					<Button
						size="sm"
						variant="ghost"
						aria-label="Авто-раскладка графа"
						onClick={onAutoLayout}
					>
						<Wand2 className="size-3.5" /> Авто-раскладка
					</Button>
					{/* Fallback kind buttons for narrow windows / no-cmdk muscle memory. */}
					<span className="mx-1 hidden h-4 w-px bg-border sm:block" />
					<Button
						size="sm"
						variant="ghost"
						className="hidden sm:inline-flex"
						aria-label="Добавить узел: Агент"
						onClick={() => onAddNode("agent_run")}
					>
						<Plus className="size-3.5" /> Агент
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="hidden sm:inline-flex"
						aria-label="Добавить узел: Цикл"
						onClick={() => onAddNode("loop")}
					>
						<Plus className="size-3.5" /> Цикл
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="hidden md:inline-flex"
						aria-label="Добавить узел: Подтверждение"
						onClick={() => onAddNode("human_approval")}
					>
						<Plus className="size-3.5" /> Подтверждение
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="hidden md:inline-flex"
						aria-label="Добавить узел: Финал"
						onClick={() => onAddNode("response")}
					>
						<Plus className="size-3.5" /> Финал
					</Button>
				</Panel>
			</Canvas>

			{/* Empty-graph hint overlay (start only) — non-interactive. */}
			{showEmptyHint && (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<div className="flex items-center gap-2 rounded-md border bg-card/80 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
						<Sparkles className="size-3.5 text-primary" />
						Перетащите роль из библиотеки или нажмите «+ Добавить узел»
					</div>
				</div>
			)}
		</div>
	);
}

/** Edge stroke colour for a branch source handle (matches the node port colour). */
function edgeStrokeForHandle(handle: string | null | undefined): string | null {
	switch (handle) {
		case "approved":
			return "#10b981";
		case "rejected":
			return "#f43f5e";
		case "body":
			return "#0ea5e9";
		default:
			return null;
	}
}

/**
 * Structural signature used to detect when an externally-provided graph changes.
 * Position-INDEPENDENT on purpose: a node drag must not trigger a re-seed (that
 * would clobber the in-progress gesture). Includes the source branch handle so a
 * branch rewire still re-seeds. Position-only operations re-seed via `reseedKey`.
 */
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
