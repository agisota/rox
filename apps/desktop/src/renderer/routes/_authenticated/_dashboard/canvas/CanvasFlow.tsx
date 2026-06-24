import type { CanvasDocument, CanvasMutationBatch } from "@rox/shared/canvas";
import { Button } from "@rox/ui/button";
import { cn } from "@rox/ui/utils";
import type {
	Connection,
	EdgeChange,
	NodeChange,
	OnSelectionChangeFunc,
	ReactFlowInstance,
} from "@xyflow/react";
import {
	applyEdgeChanges,
	applyNodeChanges,
	Background,
	ConnectionLineType,
	Controls,
	getNodesBounds,
	getViewportForBounds,
	MiniMap,
	Panel,
	ReactFlow,
	useReactFlow,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import {
	AlignHorizontalJustifyStart,
	Copy,
	Group,
	Maximize,
	StretchHorizontal,
} from "lucide-react";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
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
	isValidCanvasConnection,
	type RoxFlowEdge,
	type RoxFlowNode,
	toReactFlowEdges,
	toReactFlowNodes,
} from "./canvasFlowAdapter";
import { canvasNodeTypes } from "./RoxCanvasNode";

export interface CanvasSelection {
	nodeIds: string[];
	edgeIds: string[];
	groupIds: string[];
}

interface CanvasFlowProps {
	document: CanvasDocument;
	baseVersion: number;
	disabled?: boolean;
	modeBadge: string;
	onMutationBatch: (batch: CanvasMutationBatch, label: string) => void;
	onSelectionChange: (selection: CanvasSelection) => void;
	onCreateTextNodeAt: (position: { x: number; y: number }) => void;
	onOpenRefNode: (nodeId: string) => void;
}

export interface CanvasFlowHandle {
	/** Trigger a PNG download of the current canvas viewport. */
	exportPng: () => Promise<void>;
}

const PANEL_CLASS =
	"glass-panel flex items-center gap-1 rounded-lg border border-border/60 p-1";

export const CanvasFlow = forwardRef<CanvasFlowHandle, CanvasFlowProps>(
	function CanvasFlow(
		{
			document,
			baseVersion,
			disabled = false,
			modeBadge,
			onMutationBatch,
			onSelectionChange,
			onCreateTextNodeAt,
			onOpenRefNode,
		},
		ref,
	) {
		const { screenToFlowPosition } = useReactFlow<RoxFlowNode, RoxFlowEdge>();
		const flowWrapperRef = useRef<HTMLDivElement | null>(null);
		const instanceRef = useRef<ReactFlowInstance<
			RoxFlowNode,
			RoxFlowEdge
		> | null>(null);

		const projectedNodes = useMemo(
			() => toReactFlowNodes(document),
			[document],
		);
		const projectedEdges = useMemo(
			() => toReactFlowEdges(document),
			[document],
		);
		const [nodes, setNodes] = useState<RoxFlowNode[]>(projectedNodes);
		const [edges, setEdges] = useState<RoxFlowEdge[]>(projectedEdges);
		const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
		const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
		const [isExporting, setIsExporting] = useState(false);

		useEffect(() => {
			setNodes(projectedNodes);
			setEdges(projectedEdges);
		}, [projectedNodes, projectedEdges]);

		const handleNodesChange = useCallback(
			(changes: NodeChange<RoxFlowNode>[]) => {
				setNodes((current) => applyNodeChanges(changes, current));
				if (disabled) return;
				for (const change of changes) {
					if (change.type !== "dimensions") continue;
					if (change.resizing !== false || !change.dimensions) continue;
					onMutationBatch(
						createNodeSizeBatch({
							document,
							baseVersion,
							actorId: "renderer",
							nodeId: change.id,
							size: {
								width: Math.round(change.dimensions.width),
								height: Math.round(change.dimensions.height),
							},
						}),
						"Размер узла",
					);
				}
			},
			[baseVersion, disabled, document, onMutationBatch],
		);

		const handleEdgesChange = useCallback(
			(changes: EdgeChange<RoxFlowEdge>[]) => {
				setEdges((current) => applyEdgeChanges(changes, current));
			},
			[],
		);

		const handleNodeDragStop = useCallback(
			(_event: unknown, node: RoxFlowNode) => {
				if (disabled) return;
				onMutationBatch(
					createNodePositionBatch({
						document,
						baseVersion,
						actorId: "renderer",
						nodeId: node.id,
						position: {
							x: Math.round(node.position.x),
							y: Math.round(node.position.y),
						},
					}),
					"Перемещение узла",
				);
			},
			[baseVersion, disabled, document, onMutationBatch],
		);

		const handleConnect = useCallback(
			(connection: Connection) => {
				if (disabled || !connection.source || !connection.target) return;
				if (!isValidCanvasConnection(connection, edges)) return;
				onMutationBatch(
					createConnectNodesBatch({
						document,
						baseVersion,
						actorId: "renderer",
						sourceNodeId: connection.source,
						targetNodeId: connection.target,
					}),
					"Связь узлов",
				);
			},
			[baseVersion, disabled, document, edges, onMutationBatch],
		);

		const validateConnection = useCallback(
			(connection: Connection | RoxFlowEdge) =>
				isValidCanvasConnection(connection, edges),
			[edges],
		);

		const handleNodesDelete = useCallback(
			(deleted: RoxFlowNode[]) => {
				if (disabled || deleted.length === 0) return;
				onMutationBatch(
					createDeleteElementsBatch({
						document,
						baseVersion,
						actorId: "renderer",
						nodeIds: deleted.map((node) => node.id),
						edgeIds: [],
					}),
					"Удаление узлов",
				);
			},
			[baseVersion, disabled, document, onMutationBatch],
		);

		const handleEdgesDelete = useCallback(
			(deleted: RoxFlowEdge[]) => {
				if (disabled || deleted.length === 0) return;
				onMutationBatch(
					createDeleteElementsBatch({
						document,
						baseVersion,
						actorId: "renderer",
						nodeIds: [],
						edgeIds: deleted.map((edge) => edge.id),
					}),
					"Удаление связей",
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
				onSelectionChange({ nodeIds, edgeIds, groupIds: [] });
			},
			[onSelectionChange],
		);

		const handlePaneDoubleClick = useCallback(
			(event: React.MouseEvent) => {
				if (disabled) return;
				const position = screenToFlowPosition({
					x: event.clientX,
					y: event.clientY,
				});
				onCreateTextNodeAt({ x: position.x, y: position.y });
			},
			[disabled, onCreateTextNodeAt, screenToFlowPosition],
		);

		const handleNodeDoubleClick = useCallback(
			(_event: React.MouseEvent, node: RoxFlowNode) => {
				if (node.data.refType) onOpenRefNode(node.id);
			},
			[onOpenRefNode],
		);

		const handleAlignLeft = useCallback(() => {
			if (disabled || selectedNodeIds.length < 2) return;
			onMutationBatch(
				createAlignLeftBatch({
					document,
					baseVersion,
					actorId: "renderer",
					nodeIds: selectedNodeIds,
				}),
				"Выравнивание по левому краю",
			);
		}, [baseVersion, disabled, document, onMutationBatch, selectedNodeIds]);

		const handleDistribute = useCallback(() => {
			if (disabled || selectedNodeIds.length < 3) return;
			onMutationBatch(
				createDistributeHorizontalBatch({
					document,
					baseVersion,
					actorId: "renderer",
					nodeIds: selectedNodeIds,
				}),
				"Распределение по горизонтали",
			);
		}, [baseVersion, disabled, document, onMutationBatch, selectedNodeIds]);

		const handleGroup = useCallback(() => {
			if (disabled || selectedNodeIds.length < 2) return;
			onMutationBatch(
				createGroupSelectionBatch({
					document,
					baseVersion,
					actorId: "renderer",
					nodeIds: selectedNodeIds,
				}),
				"Группировка",
			);
		}, [baseVersion, disabled, document, onMutationBatch, selectedNodeIds]);

		const handleDuplicate = useCallback(() => {
			if (disabled || selectedNodeIds.length === 0) return;
			onMutationBatch(
				createDuplicateSelectionBatch({
					document,
					baseVersion,
					actorId: "renderer",
					nodeIds: selectedNodeIds,
				}),
				"Дублирование",
			);
		}, [baseVersion, disabled, document, onMutationBatch, selectedNodeIds]);

		const handleFitView = useCallback(() => {
			instanceRef.current?.fitView({ padding: 0.24, duration: 320 });
		}, []);

		/**
		 * PNG export following the React Flow "download image" recipe:
		 * getViewportForBounds(getNodesBounds(nodes)) -> toPng(viewport element).
		 * Returns the data URL so the parent surface can trigger the download.
		 */
		const exportToPng = useCallback(async (): Promise<string | null> => {
			const viewport = flowWrapperRef.current?.querySelector<HTMLElement>(
				".react-flow__viewport",
			);
			if (!viewport || nodes.length === 0) return null;
			setIsExporting(true);
			try {
				const bounds = getNodesBounds(nodes);
				const width = Math.min(Math.max(bounds.width + 160, 640), 4096);
				const height = Math.min(Math.max(bounds.height + 160, 480), 4096);
				const transform = getViewportForBounds(
					bounds,
					width,
					height,
					0.2,
					2,
					0.08,
				);
				return await toPng(viewport, {
					backgroundColor: "#151110",
					width,
					height,
					style: {
						width: `${width}px`,
						height: `${height}px`,
						transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
					},
				});
			} finally {
				setIsExporting(false);
			}
		}, [nodes]);

		const handleExportPng = useCallback(async () => {
			const dataUrl = await exportToPng();
			if (!dataUrl) return;
			const link = window.document.createElement("a");
			link.download = `${document.title || "canvas"}.png`;
			link.href = dataUrl;
			link.click();
		}, [document.title, exportToPng]);

		useImperativeHandle(ref, () => ({ exportPng: handleExportPng }), [
			handleExportPng,
		]);

		const selectionCount = selectedNodeIds.length + selectedEdgeIds.length;

		return (
			<div ref={flowWrapperRef} className="h-full w-full">
				<ReactFlow
					className="canvas-react-flow"
					colorMode="dark"
					connectionLineType={ConnectionLineType.SmoothStep}
					defaultEdgeOptions={{ type: "smoothstep" }}
					deleteKeyCode={disabled ? null : ["Backspace", "Delete"]}
					edges={edges}
					edgesFocusable={!disabled}
					fitView
					fitViewOptions={{ padding: 0.26 }}
					isValidConnection={validateConnection}
					maxZoom={2}
					minZoom={0.12}
					nodeTypes={canvasNodeTypes}
					nodes={nodes}
					nodesConnectable={!disabled}
					nodesDraggable={!disabled}
					nodesFocusable={!disabled}
					onConnect={handleConnect}
					onDoubleClick={handlePaneDoubleClick}
					onEdgesChange={handleEdgesChange}
					onEdgesDelete={handleEdgesDelete}
					onInit={(instance) => {
						instanceRef.current = instance;
					}}
					onNodeDoubleClick={handleNodeDoubleClick}
					onNodeDragStop={handleNodeDragStop}
					onNodesChange={handleNodesChange}
					onNodesDelete={handleNodesDelete}
					onSelectionChange={handleSelectionChange}
					panOnDrag
					panOnScroll
					proOptions={{ hideAttribution: true }}
					selectionOnDrag
				>
					<Background
						color="color-mix(in srgb, white 6%, transparent)"
						gap={32}
						size={1}
					/>
					<MiniMap
						className="!rounded-lg !border !border-border/60 glass-panel"
						maskColor="color-mix(in srgb, var(--background) 70%, transparent)"
						nodeColor="var(--sidebar-primary)"
						nodeStrokeWidth={2}
						pannable
						zoomable
					/>
					<Controls
						className="!rounded-lg !border !border-border/60 glass-panel !text-foreground"
						position="bottom-left"
						showInteractive={false}
					/>

					<Panel position="top-left">
						<div className={PANEL_CLASS}>
							<span className="px-2 font-mono text-muted-foreground text-xs">
								{selectionCount} выбрано
							</span>
							<Button
								size="icon-sm"
								variant="ghost"
								disabled={disabled || selectedNodeIds.length < 2}
								onClick={handleAlignLeft}
								title="Выровнять по левому краю · Cmd+Shift+L"
							>
								<AlignHorizontalJustifyStart />
							</Button>
							<Button
								size="icon-sm"
								variant="ghost"
								disabled={disabled || selectedNodeIds.length === 0}
								onClick={handleDuplicate}
								title="Дублировать · Cmd+D"
							>
								<Copy />
							</Button>
							<Button
								size="icon-sm"
								variant="ghost"
								disabled={disabled || selectedNodeIds.length < 3}
								onClick={handleDistribute}
								title="Распределить по горизонтали · Cmd+Shift+H"
							>
								<StretchHorizontal />
							</Button>
							<Button
								size="icon-sm"
								variant="ghost"
								disabled={disabled || selectedNodeIds.length < 2}
								onClick={handleGroup}
								title="Сгруппировать · Cmd+G"
							>
								<Group />
							</Button>
						</div>
					</Panel>

					<Panel position="top-right">
						<div className={cn(PANEL_CLASS, "px-1")}>
							<Button
								size="icon-sm"
								variant="ghost"
								onClick={handleFitView}
								title="Показать весь холст"
							>
								<Maximize />
							</Button>
							<span className="px-2 font-mono text-muted-foreground text-xs">
								{isExporting ? "Экспорт…" : modeBadge}
							</span>
						</div>
					</Panel>
				</ReactFlow>
			</div>
		);
	},
);
