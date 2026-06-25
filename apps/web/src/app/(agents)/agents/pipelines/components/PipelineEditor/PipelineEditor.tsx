"use client";

import { ReactFlowProvider } from "@rox/ui/ai-elements/flow";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { toast } from "@rox/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rox/ui/tabs";
import type { RoxWorkflowState } from "@rox/workflow-core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTRPC } from "@/trpc/react";
import {
	defaultLabelForType,
	flowToState,
	type PipelineFlowEdge,
	type PipelineFlowNode,
	stateToEdges,
	stateToNodes,
} from "./graph-adapter";
import { NodeInspector, useNodePatch } from "./NodeInspector";
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
function newBlockId(type: string): string {
	const stamp = Math.random().toString(36).slice(2, 8);
	return `${type}_${stamp}`;
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
	const queryClient = useQueryClient();

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
	const validateInput = useMemo(() => ({ pipelineId }), [pipelineId]);

	const nodes = useMemo(() => stateToNodes(graph), [graph]);
	const edges = useMemo(() => stateToEdges(graph), [graph]);

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
				void queryClient.invalidateQueries({
					queryKey: trpc.pipeline.validate.queryKey(validateInput),
				});
				saveInFlight.current = false;
				if (pendingSave.current) {
					flushPendingSaveRef.current();
					return;
				}
				setSaveState("saved");
			},
			onError: (error) => {
				saveInFlight.current = false;
				console.error("[PipelineEditor] updateGraph failed", error);
				if (pendingSave.current) {
					flushPendingSaveRef.current();
					return;
				}
				setSaveState("idle");
				toast.error("Не удалось сохранить граф");
			},
		}),
	);

	const validateQuery = useQuery(
		trpc.pipeline.validate.queryOptions(validateInput),
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

	const applyGraphChange = useCallback(
		(next: RoxWorkflowState) => {
			graphRef.current = next;
			setGraph(next);
			persist(next);
		},
		[persist],
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
		(
			type: string,
			opts?: {
				roleSlug?: string;
				label?: string;
				position?: { x: number; y: number };
			},
		) => {
			const prev = graphRef.current;
			const id = newBlockId(type);
			const count = Object.keys(prev.blocks).length;
			const next: RoxWorkflowState = {
				...prev,
				blocks: {
					...prev.blocks,
					[id]: {
						type,
						name: opts?.label ?? defaultLabelForType(type),
						position: opts?.position ?? {
							x: 180 + (count % 4) * 280,
							y: 360 + Math.floor(count / 4) * 180,
						},
						subBlocks: opts?.roleSlug ? { roleSlug: opts.roleSlug } : undefined,
					},
				},
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

	// Replace the whole working graph (used by the templates gallery insert).
	const applyTemplate = useCallback(
		(next: RoxWorkflowState) => {
			setSelectedNodeId(null);
			applyGraphChange({ ...next, id: graphRef.current.id });
		},
		[applyGraphChange],
	);

	const validation = validateQuery.data;

	return (
		<div className="flex h-[calc(100dvh-3rem)] flex-col">
			{/* Toolbar */}
			<div className="flex items-center gap-3 border-b px-4 py-2">
				<Button asChild size="icon" variant="ghost" className="size-8">
					<Link href="/agents/pipelines" aria-label="К списку пайплайнов">
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
							v2ProjectId={v2ProjectId}
							onSelectNode={setSelectedNodeId}
							onGraphChange={handleGraphChange}
							onAddNode={addNode}
							onApplyTemplate={applyTemplate}
						/>
					</ReactFlowProvider>
				</div>

				<aside className="flex w-80 shrink-0 flex-col border-l">
					{selectedNode ? (
						<NodeInspector
							selectedNode={selectedNode}
							patch={nodePatch}
							issues={validation?.issues}
							onClose={() => setSelectedNodeId(null)}
							onDeleted={() => setSelectedNodeId(null)}
						/>
					) : (
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
									selectedNodeLabel={null}
								/>
							</TabsContent>
							<TabsContent value="runs" className="min-h-0 flex-1">
								<RunMonitorPanel pipelineId={pipelineId} />
							</TabsContent>
						</Tabs>
					)}
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
