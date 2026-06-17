import { ReactFlowProvider } from "@rox/ui/ai-elements/flow";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { toast } from "@rox/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rox/ui/tabs";
import type { RoxWorkflowState } from "@rox/workflow-core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import {
	flowToState,
	type PipelineFlowEdge,
	type PipelineFlowNode,
	type PipelineNodeKind,
	stateToEdges,
	stateToNodes,
} from "./graph-adapter";
import { PipelineCanvas } from "./PipelineCanvas";
import { RoleLibraryPanel } from "./RoleLibraryPanel";
import { RunMonitorPanel } from "./RunMonitorPanel";
import { TriggerConfigPanel } from "./TriggerConfigPanel";

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

/** Generate a unique block id for a freshly-added node. */
function newBlockId(kind: PipelineNodeKind): string {
	const stamp = Math.random().toString(36).slice(2, 8);
	return `${kind}_${stamp}`;
}

/**
 * The pipeline editor shell: a draggable/connectable canvas plus the role
 * library, trigger config, and run monitor panels. Owns the working
 * `RoxWorkflowState`, debounce-saves graph edits via `pipeline.updateGraph`,
 * validates via `pipeline.validate`, and adds role/loop/approval nodes.
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

	const pipelineId = initialPipeline.id;
	const v2ProjectId = initialPipeline.v2ProjectId ?? undefined;

	const nodes = useMemo(() => stateToNodes(graph), [graph]);
	const edges = useMemo(() => stateToEdges(graph), [graph]);

	const selectedNode = useMemo(
		() => nodes.find((n) => n.id === selectedNodeId) ?? null,
		[nodes, selectedNodeId],
	);

	const updateGraphMutation = useMutation(
		trpc.pipeline.updateGraph.mutationOptions({
			onSuccess: () => setSaveState("saved"),
			onError: (error) => {
				console.error("[PipelineEditor] updateGraph failed", error);
				setSaveState("idle");
				toast.error("Не удалось сохранить граф");
			},
		}),
	);

	const validateQuery = useQuery(
		trpc.pipeline.validate.queryOptions({ pipelineId }),
	);

	// Debounced persistence of the working graph.
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingSave = useRef<{
		pipelineId: string;
		draftState: RoxWorkflowState;
	} | null>(null);
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
		pendingSave.current = null;
		updateGraphMutationRef.current.mutate({
			pipelineId: pending.pipelineId,
			draftState: pending.draftState,
		});
	}, []);

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

	const applyGraphChange = useCallback(
		(next: RoxWorkflowState) => {
			graphRef.current = next;
			setGraph(next);
			persist(next);
		},
		[persist],
	);

	// Canvas → state: fold node/edge edits back into the working graph + persist.
	const handleGraphChange = useCallback(
		(nextNodes: PipelineFlowNode[], nextEdges: PipelineFlowEdge[]) => {
			applyGraphChange(flowToState(graphRef.current, nextNodes, nextEdges));
		},
		[applyGraphChange],
	);

	const addNode = useCallback(
		(kind: PipelineNodeKind, roleSlug?: string, label?: string) => {
			const prev = graphRef.current;
			const id = newBlockId(kind);
			const count = Object.keys(prev.blocks).length;
			const next: RoxWorkflowState = {
				...prev,
				blocks: {
					...prev.blocks,
					[id]: {
						type: kind,
						name:
							label ??
							(kind === "agent_run"
								? "Агент"
								: kind === "loop"
									? "Цикл"
									: kind === "human_approval"
										? "Подтверждение"
										: "Финал"),
						position: {
							x: 180 + (count % 4) * 280,
							y: 360 + Math.floor(count / 4) * 180,
						},
						subBlocks: roleSlug ? { roleSlug } : undefined,
					},
				},
			};
			applyGraphChange(next);
		},
		[applyGraphChange],
	);

	const addRoleNode = useCallback(
		(roleSlug: string, label: string) => addNode("agent_run", roleSlug, label),
		[addNode],
	);

	const validation = validateQuery.data;

	return (
		<div className="flex h-[calc(100dvh-3rem)] flex-col">
			{/* Toolbar */}
			<div className="flex items-center gap-3 border-b px-4 py-2">
				<Button asChild size="icon" variant="ghost" className="size-8">
					<Link to="/pipelines" aria-label="К списку пайплайнов">
						<ArrowLeft className="size-4" />
					</Link>
				</Button>
				<div className="min-w-0 flex-1">
					<h1 className="truncate text-sm font-medium">
						{initialPipeline.name}
					</h1>
					<p className="truncate font-mono text-[11px] text-muted-foreground">
						{initialPipeline.slug}
					</p>
				</div>
				{validation &&
					(validation.valid ? (
						<Badge variant="default" className="gap-1">
							<CheckCircle2 className="size-3" /> граф валиден
						</Badge>
					) : (
						<Badge variant="destructive">
							{validation.issues.length} проблем(ы)
						</Badge>
					))}
				<SaveIndicator state={saveState} />
			</div>

			{/* Body: canvas + side panels */}
			<div className="flex min-h-0 flex-1">
				<div className="min-w-0 flex-1">
					<ReactFlowProvider>
						<PipelineCanvas
							nodes={nodes}
							edges={edges}
							selectedNodeId={selectedNodeId}
							onSelectNode={setSelectedNodeId}
							onGraphChange={handleGraphChange}
							onAddNode={(kind) => addNode(kind)}
						/>
					</ReactFlowProvider>
				</div>

				<aside className="flex w-80 shrink-0 flex-col border-l">
					<Tabs defaultValue="roles" className="flex min-h-0 flex-1 flex-col">
						<TabsList className="mx-2 mt-2 grid grid-cols-3">
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
								selectedNodeLabel={selectedNode?.data.label ?? null}
							/>
						</TabsContent>
						<TabsContent value="runs" className="min-h-0 flex-1">
							<RunMonitorPanel pipelineId={pipelineId} />
						</TabsContent>
					</Tabs>
				</aside>
			</div>
		</div>
	);
}

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" }) {
	if (state === "saving") {
		return (
			<span className="flex items-center gap-1 text-xs text-muted-foreground">
				<Loader2 className="size-3 animate-spin" /> сохранение…
			</span>
		);
	}
	if (state === "saved") {
		return (
			<span className="flex items-center gap-1 text-xs text-emerald-500">
				<Save className="size-3" /> сохранено
			</span>
		);
	}
	return null;
}
