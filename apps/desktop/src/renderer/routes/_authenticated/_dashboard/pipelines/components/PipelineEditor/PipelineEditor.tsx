import { ReactFlowProvider } from "@rox/ui/ai-elements/flow";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { toast } from "@rox/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rox/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import {
	type RoxEdge,
	type RoxWorkflowState,
	reachableFrom,
	validateGraph,
} from "@rox/workflow-core";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	CheckCircle2,
	Loader2,
	PanelRightClose,
	PanelRightOpen,
	Redo2,
	Save,
	Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";
import { autoLayoutGraph } from "./auto-layout";
import {
	flowToState,
	type PipelineFlowEdge,
	type PipelineFlowNode,
	type PipelineNodeKind,
	stateToEdges,
	stateToNodes,
} from "./graph-adapter";
import { isStructuralChange } from "./graph-diff";
import { NodeInspector, useNodePatch } from "./NodeInspector";
import { NodePalette } from "./NodePalette";
import { PipelineCanvas, type PipelineCanvasHandle } from "./PipelineCanvas";
import { RoleLibraryPanel } from "./RoleLibraryPanel";
import { RunMonitorPanel } from "./RunMonitorPanel";
import { ToolbarRunButton } from "./ToolbarRunButton";
import { TriggerConfigPanel } from "./TriggerConfigPanel";
import { useGraphHistory } from "./useGraphHistory";
import { useRunTrace } from "./useRunTrace";

const SAVE_DEBOUNCE_MS = 800;

type PipelineRow = {
	id: string;
	name: string;
	slug: string;
	v2ProjectId: string | null;
	draftState: RoxWorkflowState;
};

type PipelineEditorProps = {
	pipeline: PipelineRow;
};

/** Options for placing a freshly-added node. */
type AddNodeOptions = {
	roleSlug?: string;
	label?: string;
	/** Exact flow position (drop / palette). When omitted, cascade-place. */
	position?: { x: number; y: number };
	/** Auto-connect onto the reachable frontier (default true). */
	autoConnect?: boolean;
};

/** Generate a unique block id for a freshly-added node. */
function newBlockId(kind: PipelineNodeKind): string {
	const stamp = Math.random().toString(36).slice(2, 8);
	return `${kind}_${stamp}`;
}

/** Default RU label for a node kind. */
function defaultLabel(kind: PipelineNodeKind): string {
	switch (kind) {
		case "agent_run":
			return "Агент";
		case "loop":
			return "Цикл";
		case "human_approval":
			return "Подтверждение";
		case "response":
			return "Финал";
		default:
			return "Узел";
	}
}

/** Whether a block is enabled (mirrors validateGraph's reachability predicate). */
function isBlockEnabled(state: RoxWorkflowState, id: string): boolean {
	return state.blocks[id]?.enabled !== false;
}

/**
 * Pick the block a freshly-added node should be wired *from* so it lands on the
 * reachable frontier instead of being instantly flagged "unreachable from
 * start". Returns the deepest enabled block reachable from the single start
 * (the natural tail of the current chain), falling back to the start itself.
 * Returns null when there is no single start block to anchor on.
 */
function pickAnchorBlockId(state: RoxWorkflowState): string | null {
	const startIds = Object.keys(state.blocks).filter(
		(id) => state.blocks[id]?.type === "start",
	);
	const start = startIds.length === 1 ? startIds[0] : undefined;
	if (start === undefined) return null;

	const reachable = reachableFrom(state, start, (id) =>
		isBlockEnabled(state, id),
	);
	const adjacency = new Map<string, string[]>();
	for (const edge of state.edges) {
		const list = adjacency.get(edge.source) ?? [];
		list.push(edge.target);
		adjacency.set(edge.source, list);
	}
	const depth = new Map<string, number>([[start, 0]]);
	const queue: string[] = [start];
	let anchor = start;
	let bestDepth = 0;
	while (queue.length > 0) {
		const u = queue.shift();
		if (u === undefined) break;
		const d = depth.get(u) ?? 0;
		if (d > bestDepth) {
			bestDepth = d;
			anchor = u;
		}
		for (const v of adjacency.get(u) ?? []) {
			if (!reachable.has(v) || depth.has(v)) continue;
			depth.set(v, d + 1);
			queue.push(v);
		}
	}
	return anchor;
}

/**
 * The pipeline editor shell: a draggable/connectable canvas plus the role
 * library, trigger config, and run monitor panels. Owns the working
 * `RoxWorkflowState`, debounce-saves graph edits via `pipeline.updateGraph`,
 * validates the live graph synchronously via `validateGraph`, adds
 * role/loop/approval nodes (toolbar / cmdk palette / drag-drop), supports
 * undo/redo, auto-layout, and an on-canvas run trace.
 */
export function PipelineEditor({
	pipeline: initialPipeline,
}: PipelineEditorProps) {
	const trpc = useTRPC();

	// Authoritative working graph. Seeded from the server row, then mutated
	// locally and pushed back (debounced).
	const [graph, setGraph] = useState<RoxWorkflowState>(
		initialPipeline.draftState,
	);
	const graphRef = useRef(graph);
	graphRef.current = graph;
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
		"idle",
	);
	const [rolesPanelOpen, setRolesPanelOpen] = useState(true);
	const [paletteOpen, setPaletteOpen] = useState(false);
	// Bumped to force the canvas to re-seed positions (auto-layout, undo/redo)
	// without folding positions into the (drag-safe) structural signature.
	const [reseedKey, setReseedKey] = useState(0);
	const canvasHandle = useRef<PipelineCanvasHandle>(null);

	const pipelineId = initialPipeline.id;
	const v2ProjectId = initialPipeline.v2ProjectId ?? undefined;

	// Live on-canvas run trace (polls getRun; maps blockId -> step status).
	const { runStatusByBlockId, activeRunId, setActiveRunId } =
		useRunTrace(pipelineId);

	const baseNodes = useMemo(() => stateToNodes(graph), [graph]);
	const edges = useMemo(() => stateToEdges(graph), [graph]);

	// Overlay live run-status onto node data so every node lights up during a run.
	const nodes = useMemo(() => {
		if (Object.keys(runStatusByBlockId).length === 0) return baseNodes;
		return baseNodes.map((node) =>
			runStatusByBlockId[node.id]
				? {
						...node,
						data: { ...node.data, runStatus: runStatusByBlockId[node.id] },
					}
				: node,
		);
	}, [baseNodes, runStatusByBlockId]);

	// Synchronous, client-side validation of the LIVE in-memory graph. This makes
	// the toolbar badge + per-node inspector issues update instantly on every edit,
	// instead of lagging behind the 800ms debounced updateGraph round-trip. Reuses
	// the same `validateGraph` the server runs, so the result shape is identical.
	const validation = useMemo(() => validateGraph(graph), [graph]);
	const errorCount = useMemo(
		() => validation.issues.filter((i) => i.severity === "error").length,
		[validation],
	);

	const selectedNode = useMemo(
		() => nodes.find((n) => n.id === selectedNodeId) ?? null,
		[nodes, selectedNodeId],
	);

	// Debounced persistence of the working graph.
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingSave = useRef<{
		pipelineId: string;
		draftState: RoxWorkflowState;
	} | null>(null);
	const saveInFlight = useRef(false);
	const flushPendingSaveRef = useRef<() => void>(() => {});

	const updateGraphMutation = useMutation(
		trpc.pipeline.updateGraph.mutationOptions({
			onSuccess: () => {
				saveInFlight.current = false;
				if (pendingSave.current) {
					flushPendingSaveRef.current();
					return;
				}
				setSaveState("saved");
			},
			onError: (error) => {
				saveInFlight.current = false;
				logger.error("[PipelineEditor] updateGraph failed", error);
				if (pendingSave.current) {
					flushPendingSaveRef.current();
					return;
				}
				setSaveState("idle");
				toast.error("Не удалось сохранить граф");
			},
		}),
	);

	const updateGraphMutationRef = useRef(updateGraphMutation);
	useEffect(() => {
		updateGraphMutationRef.current = updateGraphMutation;
	}, [updateGraphMutation]);

	const flushPendingSave = useCallback(() => {
		if (saveTimer.current) {
			clearTimeout(saveTimer.current);
			saveTimer.current = null;
		}
		const pending = pendingSave.current;
		if (!pending) return;
		if (saveInFlight.current) return;
		pendingSave.current = null;
		saveInFlight.current = true;
		updateGraphMutationRef.current.mutate({
			pipelineId: pending.pipelineId,
			draftState: pending.draftState,
		});
	}, []);
	flushPendingSaveRef.current = flushPendingSave;

	const persist = useCallback(
		(next: RoxWorkflowState) => {
			setSaveState("saving");
			pendingSave.current = { pipelineId, draftState: next };
			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(() => {
				flushPendingSave();
			}, SAVE_DEBOUNCE_MS);
		},
		[pipelineId, flushPendingSave],
	);

	useEffect(() => () => flushPendingSave(), [flushPendingSave]);

	// --- Undo/redo --------------------------------------------------------------
	// `replay` restores a snapshot through the SAME save loop (never bypassing
	// pendingSave/saveInFlight) and bumps reseedKey so the canvas re-seeds.
	const replaySnapshot = useCallback(
		(snapshot: RoxWorkflowState) => {
			graphRef.current = snapshot;
			setGraph(snapshot);
			persist(snapshot);
			setReseedKey((k) => k + 1);
		},
		[persist],
	);
	const history = useGraphHistory(graphRef, replaySnapshot);

	const applyGraphChange = useCallback(
		(next: RoxWorkflowState) => {
			// Checkpoint for undo only on structural edits (add/delete/connect/
			// rename/toggle/subBlocks), never on pure position drags — otherwise
			// undo would step pixel by pixel through a drag.
			if (isStructuralChange(graphRef.current, next)) {
				history.record(graphRef.current);
			}
			graphRef.current = next;
			setGraph(next);
			persist(next);
		},
		[persist, history],
	);

	// Per-node inspector edits fold into the same authoritative graph + save loop.
	const nodePatch = useNodePatch(graphRef, applyGraphChange);

	// Canvas → state: fold node/edge edits back into the working graph + persist.
	const handleGraphChange = useCallback(
		(nextNodes: PipelineFlowNode[], nextEdges: PipelineFlowEdge[]) => {
			applyGraphChange(flowToState(graphRef.current, nextNodes, nextEdges));
		},
		[applyGraphChange],
	);

	const addNode = useCallback(
		(kind: PipelineNodeKind, opts: AddNodeOptions = {}) => {
			const prev = graphRef.current;
			const id = newBlockId(kind);
			const count = Object.keys(prev.blocks).length;
			const autoConnect = opts.autoConnect ?? true;
			const anchor = autoConnect ? pickAnchorBlockId(prev) : null;
			const position = opts.position ?? {
				x: 180 + (count % 4) * 280,
				y: 360 + Math.floor(count / 4) * 180,
			};
			const next: RoxWorkflowState = {
				...prev,
				blocks: {
					...prev.blocks,
					[id]: {
						type: kind,
						name: opts.label ?? defaultLabel(kind),
						position,
						subBlocks: opts.roleSlug ? { roleSlug: opts.roleSlug } : undefined,
					},
				},
				edges:
					anchor !== null
						? [
								...prev.edges,
								{
									id: `${anchor}->${id}`,
									source: anchor,
									target: id,
								} satisfies RoxEdge,
							]
						: prev.edges,
			};
			applyGraphChange(next);
			// Open the inspector on the freshly-added node so it's ready to edit.
			setSelectedNodeId(id);
		},
		[applyGraphChange],
	);

	const addRoleNode = useCallback(
		(roleSlug: string, label: string) =>
			addNode("agent_run", { roleSlug, label }),
		[addNode],
	);

	// Drop from palette/role-library: place at the cursor + auto-connect.
	const handleDropNode = useCallback(
		(
			kind: PipelineNodeKind,
			position: { x: number; y: number },
			roleSlug?: string,
			label?: string,
		) => {
			addNode(kind, { position, roleSlug, label, autoConnect: true });
		},
		[addNode],
	);

	// cmdk palette pick: place at the viewport centre + auto-connect.
	const handlePalettePick = useCallback(
		(kind: PipelineNodeKind, roleSlug?: string, label?: string) => {
			const center = canvasHandle.current?.getViewportCenter();
			addNode(kind, {
				roleSlug,
				label,
				position: center,
				autoConnect: true,
			});
		},
		[addNode],
	);

	// Auto-layout: dagre LR reposition, re-seed the canvas, then fit.
	const handleAutoLayout = useCallback(() => {
		const laid = autoLayoutGraph(graphRef.current);
		// Layout changes positions only (not structural) — record a checkpoint
		// explicitly so it is undoable, then apply + re-seed + fit.
		history.record(graphRef.current);
		graphRef.current = laid;
		setGraph(laid);
		persist(laid);
		setReseedKey((k) => k + 1);
		// Fit after the canvas has re-seeded.
		requestAnimationFrame(() => canvasHandle.current?.fitView());
	}, [history, persist]);

	// Keyboard: Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z (or Ctrl+Y) redo, Cmd/Ctrl+K
	// opens the add-node palette. Ignored while typing in a field.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const typing =
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable);
			const mod = e.metaKey || e.ctrlKey;
			if (!mod) return;
			const key = e.key.toLowerCase();
			if (key === "k" && !typing) {
				e.preventDefault();
				setPaletteOpen((open) => !open);
				return;
			}
			if (typing) return;
			if (key === "z") {
				e.preventDefault();
				if (e.shiftKey) history.redo();
				else history.undo();
			} else if (key === "y") {
				e.preventDefault();
				history.redo();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [history]);

	// The canvas is "empty" (show the hint) when only the start node exists.
	const showEmptyHint = useMemo(
		() => Object.keys(graph.blocks).length <= 1,
		[graph.blocks],
	);

	const validBadge = errorCount === 0;

	return (
		<div className="flex h-[calc(100dvh-3rem)] w-full min-w-0 flex-1 flex-col">
			{/* Toolbar */}
			<div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
				<Button asChild size="icon" variant="ghost" className="size-8">
					<Link to="/pipelines" aria-label="К списку пайплайнов">
						<ArrowLeft className="size-4" />
					</Link>
				</Button>
				<div className="min-w-48 flex-1">
					<h1 className="truncate text-sm font-medium">
						{initialPipeline.name}
					</h1>
					<p className="truncate font-mono text-[11px] text-muted-foreground">
						{initialPipeline.slug}
					</p>
				</div>
				<div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
					{validBadge ? (
						<Badge variant="default" className="gap-1 whitespace-nowrap">
							<CheckCircle2 className="size-3" /> граф валиден
						</Badge>
					) : (
						<Badge variant="destructive" className="whitespace-nowrap">
							{errorCount} проблем(ы)
						</Badge>
					)}

					{/* Undo / redo */}
					<div className="flex items-center">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									className="size-8"
									aria-label="Отменить"
									disabled={!history.canUndo}
									onClick={() => history.undo()}
								>
									<Undo2 className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Отменить (Cmd/Ctrl+Z)</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									className="size-8"
									aria-label="Повторить"
									disabled={!history.canRedo}
									onClick={() => history.redo()}
								>
									<Redo2 className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Повторить (Shift+Cmd/Ctrl+Z)</TooltipContent>
						</Tooltip>
					</div>

					<ToolbarRunButton
						pipelineId={pipelineId}
						problemCount={errorCount}
						saveInFlight={saveState === "saving"}
						onRunStarted={setActiveRunId}
					/>

					<SaveIndicator state={saveState} />
					<Button
						size="icon"
						variant="ghost"
						className="size-8"
						aria-label={
							rolesPanelOpen
								? "Скрыть библиотеку ролей"
								: "Показать библиотеку ролей"
						}
						aria-pressed={rolesPanelOpen}
						onClick={() => setRolesPanelOpen((open) => !open)}
					>
						{rolesPanelOpen ? (
							<PanelRightClose className="size-4" />
						) : (
							<PanelRightOpen className="size-4" />
						)}
					</Button>
				</div>
			</div>

			{/* Body: canvas + side panels */}
			<div className="flex min-h-0 flex-1 overflow-hidden">
				<div className="relative h-full min-w-0 flex-1 basis-0">
					<ReactFlowProvider>
						<PipelineCanvas
							nodes={nodes}
							edges={edges}
							selectedNodeId={selectedNodeId}
							onSelectNode={setSelectedNodeId}
							onGraphChange={handleGraphChange}
							onAddNode={(kind) => addNode(kind)}
							onDropNode={handleDropNode}
							onOpenPalette={() => setPaletteOpen(true)}
							onAutoLayout={handleAutoLayout}
							handleRef={canvasHandle}
							showEmptyHint={showEmptyHint}
							reseedKey={reseedKey}
						/>
					</ReactFlowProvider>
				</div>

				{rolesPanelOpen && (
					<aside className="flex w-[clamp(17rem,30vw,21rem)] shrink-0 flex-col border-l bg-background">
						{selectedNode ? (
							<NodeInspector
								selectedNode={selectedNode}
								patch={nodePatch}
								issues={validation.issues}
								onClose={() => setSelectedNodeId(null)}
								onDeleted={() => setSelectedNodeId(null)}
							/>
						) : (
							<Tabs
								defaultValue="roles"
								className="flex min-h-0 flex-1 flex-col"
							>
								<TabsList className="mx-2 mt-2 grid h-auto grid-cols-3">
									<TabsTrigger value="roles" className="text-xs">
										Роли
									</TabsTrigger>
									<TabsTrigger value="triggers" className="text-xs">
										Триггеры
									</TabsTrigger>
									<TabsTrigger value="runs" className="text-xs">
										Запуски
									</TabsTrigger>
								</TabsList>
								<TabsContent value="roles" className="min-h-0 flex-1">
									<RoleLibraryPanel
										v2ProjectId={v2ProjectId}
										onAddRole={addRoleNode}
									/>
								</TabsContent>
								<TabsContent value="triggers" className="min-h-0 flex-1">
									<TriggerConfigPanel
										pipelineId={pipelineId}
										selectedNodeId={selectedNodeId}
										selectedNodeLabel={null}
									/>
								</TabsContent>
								<TabsContent value="runs" className="min-h-0 flex-1">
									<RunMonitorPanel
										pipelineId={pipelineId}
										activeRunId={activeRunId}
										onSelectRun={setActiveRunId}
									/>
								</TabsContent>
							</Tabs>
						)}
					</aside>
				)}
			</div>

			{/* Add-node command palette (cmdk) */}
			<NodePalette
				open={paletteOpen}
				onOpenChange={setPaletteOpen}
				v2ProjectId={v2ProjectId}
				onPick={handlePalettePick}
			/>
		</div>
	);
}

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" }) {
	if (state === "saving") {
		return (
			<output
				aria-live="polite"
				className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
			>
				<Loader2 className="size-3 animate-spin" /> сохранение…
			</output>
		);
	}
	if (state === "saved") {
		return (
			<output
				aria-live="polite"
				className="flex items-center gap-1 whitespace-nowrap text-xs text-emerald-500"
			>
				<Save className="size-3" /> сохранено
			</output>
		);
	}
	return null;
}
