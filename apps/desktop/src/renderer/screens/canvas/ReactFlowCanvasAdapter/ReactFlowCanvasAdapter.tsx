import type { CanvasDocument, CanvasMutationBatch } from "@rox/shared/canvas";
import { cn } from "@rox/ui/utils";
import type {
	Connection,
	EdgeChange,
	NodeChange,
	NodeProps,
	OnNodeDrag,
	OnSelectionChangeFunc,
} from "@xyflow/react";
import {
	applyEdgeChanges,
	applyNodeChanges,
	Background,
	Controls,
	Handle,
	MiniMap,
	NodeResizer,
	Panel,
	Position,
	ReactFlow,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";
import {
	createAlignLeftBatch,
	createConnectNodesBatch,
	createDeleteElementsBatch,
	createDistributeHorizontalBatch,
	createDuplicateSelectionBatch,
	createGroupSelectionBatch,
	createNodePositionBatch,
	createNodeSizeBatch,
	type RoxFlowEdge,
	type RoxFlowNode,
	toReactFlowEdges,
	toReactFlowNodes,
} from "./react-flow-canvas-adapter";

type ReactFlowCanvasAdapterProps = {
	document: CanvasDocument;
	baseVersion: number;
	disabled?: boolean;
	compact?: boolean;
	onMutationBatch: (batch: CanvasMutationBatch) => void;
	onSelectionChange?: (selection: {
		nodeIds: string[];
		edgeIds: string[];
		groupIds: string[];
	}) => void;
};

function isEditableShortcutTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tagName = target.tagName.toLowerCase();
	return (
		tagName === "input" ||
		tagName === "textarea" ||
		tagName === "select" ||
		target.isContentEditable
	);
}

function getNodeTone(nodeType: string): string {
	switch (nodeType) {
		case "chat-session":
		case "message":
			return "border-sky-300/45 bg-sky-950/85";
		case "note":
		case "prompt":
			return "border-amber-200/45 bg-amber-950/80";
		case "artifact":
		case "file":
		case "image":
		case "pdf":
			return "border-emerald-200/45 bg-emerald-950/80";
		case "task":
		case "tool-call":
			return "border-violet-200/45 bg-violet-950/80";
		case "url":
		case "canvas":
			return "border-cyan-200/45 bg-cyan-950/80";
		default:
			return "border-white/15 bg-slate-950/88";
	}
}

function RoxCanvasNode({ data, selected }: NodeProps<RoxFlowNode>) {
	return (
		<div
			className={cn(
				"relative h-full overflow-hidden rounded-2xl border p-4 shadow-[0_22px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl",
				"transition-transform duration-150",
				getNodeTone(data.nodeType),
				selected && "ring-2 ring-cyan-200/80",
			)}
		>
			<NodeResizer
				color="rgba(125, 211, 252, 0.92)"
				isVisible={selected}
				minHeight={96}
				minWidth={180}
			/>
			<Handle
				className="!size-2.5 !border-cyan-100/80 !bg-cyan-300"
				position={Position.Left}
				type="target"
			/>
			<Handle
				className="!size-2.5 !border-cyan-100/80 !bg-cyan-300"
				position={Position.Right}
				type="source"
			/>
			<div className="flex items-center justify-between gap-3">
				<span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 font-medium text-[10px] text-white/70 uppercase tracking-[0.2em]">
					{data.nodeType}
				</span>
				<span className="rounded-full bg-black/25 px-2 py-1 font-mono text-[10px] text-white/45">
					{data.canvasNodeId.slice(0, 8)}
				</span>
			</div>
			<h3 className="mt-4 line-clamp-2 font-semibold text-base text-white">
				{data.title}
			</h3>
			{data.body ? (
				<p className="mt-2 line-clamp-3 text-sm text-white/58">{data.body}</p>
			) : null}
			<div className="absolute right-4 bottom-4 left-4 flex items-center justify-between gap-2">
				<span className="truncate text-[11px] text-white/42">
					{data.refLabel}
				</span>
				{data.tags.length > 0 ? (
					<span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-white/52">
						{data.tags[0]}
					</span>
				) : null}
			</div>
		</div>
	);
}

const nodeTypes = {
	roxCanvasNode: RoxCanvasNode,
};

export function ReactFlowCanvasAdapter({
	document,
	baseVersion,
	disabled = false,
	compact = false,
	onMutationBatch,
	onSelectionChange,
}: ReactFlowCanvasAdapterProps) {
	const projectedNodes = useMemo(() => toReactFlowNodes(document), [document]);
	const projectedEdges = useMemo(() => toReactFlowEdges(document), [document]);
	const [nodes, setNodes] = useState<RoxFlowNode[]>(projectedNodes);
	const [edges, setEdges] = useState<RoxFlowEdge[]>(projectedEdges);
	const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
	const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);

	useEffect(() => {
		setNodes(projectedNodes);
		setEdges(projectedEdges);
	}, [projectedNodes, projectedEdges]);

	const handleNodesChange = useCallback(
		(changes: NodeChange<RoxFlowNode>[]) => {
			setNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
			for (const change of changes) {
				if (change.type !== "dimensions") continue;
				if (change.resizing !== false || !change.dimensions) continue;
				if (disabled) continue;
				onMutationBatch(
					createNodeSizeBatch({
						document,
						nodeId: change.id,
						size: {
							width: Math.round(change.dimensions.width),
							height: Math.round(change.dimensions.height),
						},
						baseVersion,
						actorId: "renderer",
					}),
				);
			}
		},
		[baseVersion, disabled, document, onMutationBatch],
	);

	const handleEdgesChange = useCallback(
		(changes: EdgeChange<RoxFlowEdge>[]) => {
			setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));
		},
		[],
	);

	const handleNodeDragStop = useCallback<OnNodeDrag<RoxFlowNode>>(
		(_event, node) => {
			if (disabled) return;
			onMutationBatch(
				createNodePositionBatch({
					document,
					nodeId: node.id,
					position: {
						x: Math.round(node.position.x),
						y: Math.round(node.position.y),
					},
					baseVersion,
					actorId: "renderer",
				}),
			);
		},
		[baseVersion, disabled, document, onMutationBatch],
	);

	const handleConnect = useCallback(
		(connection: Connection) => {
			if (disabled || !connection.source || !connection.target) return;
			onMutationBatch(
				createConnectNodesBatch({
					document,
					sourceNodeId: connection.source,
					targetNodeId: connection.target,
					baseVersion,
					actorId: "renderer",
				}),
			);
		},
		[baseVersion, disabled, document, onMutationBatch],
	);

	const handleNodesDelete = useCallback(
		(deletedNodes: RoxFlowNode[]) => {
			if (disabled || deletedNodes.length === 0) return;
			onMutationBatch(
				createDeleteElementsBatch({
					document,
					nodeIds: deletedNodes.map((node) => node.id),
					edgeIds: [],
					baseVersion,
					actorId: "renderer",
				}),
			);
		},
		[baseVersion, disabled, document, onMutationBatch],
	);

	const handleEdgesDelete = useCallback(
		(deletedEdges: RoxFlowEdge[]) => {
			if (disabled || deletedEdges.length === 0) return;
			onMutationBatch(
				createDeleteElementsBatch({
					document,
					nodeIds: [],
					edgeIds: deletedEdges.map((edge) => edge.id),
					baseVersion,
					actorId: "renderer",
				}),
			);
		},
		[baseVersion, disabled, document, onMutationBatch],
	);

	const handleSelectionChange = useCallback<
		OnSelectionChangeFunc<RoxFlowNode, RoxFlowEdge>
	>(
		({ nodes: selectedNodes, edges: selectedEdges }) => {
			const nodeIds = selectedNodes.map((node) => node.id);
			const edgeIds = selectedEdges.map((edge) => edge.id);
			setSelectedNodeIds(nodeIds);
			setSelectedEdgeIds(edgeIds);
			onSelectionChange?.({
				nodeIds,
				edgeIds,
				groupIds: [],
			});
		},
		[onSelectionChange],
	);

	const handleAlignLeft = useCallback(() => {
		if (disabled || selectedNodeIds.length < 2) return;
		onMutationBatch(
			createAlignLeftBatch({
				document,
				nodeIds: selectedNodeIds,
				baseVersion,
				actorId: "renderer",
			}),
		);
	}, [baseVersion, disabled, document, onMutationBatch, selectedNodeIds]);

	const handleDistributeHorizontal = useCallback(() => {
		if (disabled || selectedNodeIds.length < 3) return;
		onMutationBatch(
			createDistributeHorizontalBatch({
				document,
				nodeIds: selectedNodeIds,
				baseVersion,
				actorId: "renderer",
			}),
		);
	}, [baseVersion, disabled, document, onMutationBatch, selectedNodeIds]);

	const handleGroupSelection = useCallback(() => {
		if (disabled || selectedNodeIds.length < 2) return;
		onMutationBatch(
			createGroupSelectionBatch({
				document,
				nodeIds: selectedNodeIds,
				baseVersion,
				actorId: "renderer",
			}),
		);
	}, [baseVersion, disabled, document, onMutationBatch, selectedNodeIds]);

	const handleDuplicateSelection = useCallback(() => {
		if (disabled || selectedNodeIds.length === 0) return;
		onMutationBatch(
			createDuplicateSelectionBatch({
				document,
				nodeIds: selectedNodeIds,
				baseVersion,
				actorId: "renderer",
			}),
		);
	}, [baseVersion, disabled, document, onMutationBatch, selectedNodeIds]);

	const handleCanvasShortcutKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (disabled || isEditableShortcutTarget(event.target)) return;
			const key = event.key.toLowerCase();
			const isMod = event.metaKey || event.ctrlKey;
			if (!isMod) return;
			if (key === "d") {
				event.preventDefault();
				handleDuplicateSelection();
				return;
			}
			if (key === "g" && !event.shiftKey) {
				event.preventDefault();
				handleGroupSelection();
				return;
			}
			if (event.shiftKey && key === "l") {
				event.preventDefault();
				handleAlignLeft();
				return;
			}
			if (event.shiftKey && key === "h") {
				event.preventDefault();
				handleDistributeHorizontal();
			}
		},
		[
			disabled,
			handleAlignLeft,
			handleDistributeHorizontal,
			handleDuplicateSelection,
			handleGroupSelection,
		],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleCanvasShortcutKeyDown, {
			capture: true,
		});
		return () => {
			window.removeEventListener("keydown", handleCanvasShortcutKeyDown, {
				capture: true,
			});
		};
	}, [handleCanvasShortcutKeyDown]);

	return (
		<ReactFlow
			className="canvas-react-flow"
			colorMode="dark"
			defaultEdgeOptions={{
				type: "smoothstep",
			}}
			deleteKeyCode={disabled ? null : ["Backspace", "Delete"]}
			edges={edges}
			edgesFocusable={!disabled}
			fitView
			fitViewOptions={{ padding: compact ? 0.18 : 0.28 }}
			maxZoom={2}
			minZoom={0.12}
			nodeTypes={nodeTypes}
			nodes={nodes}
			nodesConnectable={!disabled}
			nodesDraggable={!disabled}
			nodesFocusable={!disabled}
			onConnect={handleConnect}
			onEdgesChange={handleEdgesChange}
			onEdgesDelete={handleEdgesDelete}
			onNodeDragStop={handleNodeDragStop}
			onNodesChange={handleNodesChange}
			onNodesDelete={handleNodesDelete}
			onSelectionChange={handleSelectionChange}
			panOnDrag
			selectionOnDrag
		>
			<Background color="rgba(255,255,255,0.12)" gap={32} size={1} />
			<MiniMap
				className="!rounded-2xl !border !border-white/10 !bg-black/50"
				maskColor="rgba(2,6,23,0.62)"
				nodeColor="rgba(125,211,252,0.82)"
				nodeStrokeWidth={2}
				pannable
				zoomable
			/>
			<Controls
				className="!rounded-2xl !border !border-white/10 !bg-black/50 !text-white"
				position="bottom-left"
				showInteractive={false}
			/>
			<Panel position="top-right">
				<div className="rounded-2xl border border-white/10 bg-black/45 px-3 py-2 text-white/60 text-xs backdrop-blur-xl">
					Infinite pan/zoom · React Flow projection ·{" "}
					{disabled ? "Saving" : "Mutation-backed"}
				</div>
			</Panel>
			<Panel position="top-left">
				<div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/45 p-2 text-xs backdrop-blur-xl">
					<span className="px-2 text-white/52">
						{selectedNodeIds.length + selectedEdgeIds.length} selected
					</span>
					<button
						className="rounded-xl bg-white/10 px-3 py-1.5 text-white/70 hover:bg-white/15 disabled:opacity-35"
						disabled={disabled || selectedNodeIds.length < 2}
						onClick={handleAlignLeft}
						type="button"
					>
						Align left
					</button>
					<button
						className="rounded-xl bg-white/10 px-3 py-1.5 text-white/70 hover:bg-white/15 disabled:opacity-35"
						disabled={disabled || selectedNodeIds.length === 0}
						onClick={handleDuplicateSelection}
						type="button"
					>
						Duplicate
					</button>
					<button
						className="rounded-xl bg-white/10 px-3 py-1.5 text-white/70 hover:bg-white/15 disabled:opacity-35"
						disabled={disabled || selectedNodeIds.length < 3}
						onClick={handleDistributeHorizontal}
						type="button"
					>
						Distribute H
					</button>
					<button
						className="rounded-xl bg-cyan-300/90 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-200 disabled:opacity-35"
						disabled={disabled || selectedNodeIds.length < 2}
						onClick={handleGroupSelection}
						type="button"
					>
						Group
					</button>
				</div>
			</Panel>
		</ReactFlow>
	);
}
