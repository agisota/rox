"use client";

import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { Switch } from "@rox/ui/switch";
import type { WorkflowIssue } from "@rox/workflow-core";
import {
	Bot,
	Flag,
	type LucideIcon,
	Play,
	Repeat,
	ShieldCheck,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { PipelineFlowNode, PipelineNodeKind } from "../graph-adapter";
import { AgentNodeForm } from "./forms/AgentNodeForm";
import { ConfirmationNodeForm } from "./forms/ConfirmationNodeForm";
import { FinalNodeForm } from "./forms/FinalNodeForm";
import { LoopNodeForm } from "./forms/LoopNodeForm";
import { StartNodeForm } from "./forms/StartNodeForm";
import type { NodePatchApi } from "./useNodePatch";

const KIND_ICON: Record<PipelineNodeKind, LucideIcon> = {
	start: Play,
	agent_run: Bot,
	loop: Repeat,
	human_approval: ShieldCheck,
	response: Flag,
};

const KIND_LABEL: Record<PipelineNodeKind, string> = {
	start: "Старт",
	agent_run: "Агент-роль",
	loop: "Цикл",
	human_approval: "Подтверждение",
	response: "Финал",
};

type NodeInspectorProps = {
	/** The selected canvas node, or null when nothing is selected. */
	selectedNode: PipelineFlowNode | null;
	/** Patch API bound to the editor's debounced save loop. */
	patch: NodePatchApi;
	/** All validation issues for the graph (filtered to this block by id). */
	issues: WorkflowIssue[] | undefined;
	/** Close the inspector (deselect). */
	onClose: () => void;
	/** Notify the parent that the selected node was deleted (clear selection). */
	onDeleted: () => void;
};

/**
 * The per-node inspector: a Dify/Sim-style takeover of the right panel shown when
 * a node is selected. Header = type icon + inline rename + enabled Switch +
 * delete; a per-block issues list explains why a node is flagged; the body is the
 * type-specific sub-form. Returns null when no node is selected.
 *
 * Cache-first (AGENTS.md #9): values seed from `selectedNode.data`; writes go
 * through `patch` (graphRef-authoritative). Sub-forms remount per node id (keyed
 * by the parent) so local state re-seeds on selection change.
 */
export function NodeInspector({
	selectedNode,
	patch,
	issues,
	onClose,
	onDeleted,
}: NodeInspectorProps) {
	if (!selectedNode) return null;

	const { kind, blockId, label, enabled } = selectedNode.data;
	const Icon = KIND_ICON[kind];
	const isStart = kind === "start";
	const blockIssues = (issues ?? []).filter(
		(issue) => issue.blockId === blockId,
	);

	const handleDelete = () => {
		const result = patch.deleteNode(blockId);
		if (result.ok) onDeleted();
	};

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="flex items-start gap-2 border-b p-3">
				<Icon className="mt-1.5 size-4 shrink-0 text-primary" />
				<div className="min-w-0 flex-1">
					<InlineRename
						key={blockId}
						initial={label}
						onCommit={(name) => patch.renameNode(blockId, name)}
					/>
					<p className="mt-0.5 text-[11px] text-muted-foreground">
						{KIND_LABEL[kind]}
					</p>
				</div>
				<Button
					size="icon"
					variant="ghost"
					className="size-7 shrink-0"
					aria-label="Закрыть инспектор"
					onClick={onClose}
				>
					<X className="size-4" />
				</Button>
			</div>

			{/* Body */}
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
				{!isStart && (
					<div className="flex items-center justify-between">
						<Label htmlFor="node-enabled" className="text-xs">
							Узел включён
						</Label>
						<Switch
							id="node-enabled"
							checked={enabled !== false}
							aria-label="Узел включён"
							onCheckedChange={(value) =>
								patch.patchNode(blockId, { enabled: value })
							}
						/>
					</div>
				)}

				{blockIssues.length > 0 && (
					<div className="flex flex-col gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2">
						<p className="text-[11px] font-medium text-destructive">
							Проблемы узла
						</p>
						<ul className="flex flex-col gap-1">
							{blockIssues.map((issue) => (
								<li
									key={`${issue.code}-${issue.path ?? ""}`}
									className="text-[11px] text-muted-foreground"
								>
									{issue.message}
								</li>
							))}
						</ul>
					</div>
				)}

				<NodeForm node={selectedNode} patch={patch} kind={kind} />
			</div>

			{/* Footer */}
			{!isStart && (
				<div className="border-t p-3">
					<Button
						size="sm"
						variant="outline"
						className="w-full text-destructive hover:text-destructive"
						onClick={handleDelete}
					>
						<Trash2 className="size-3.5" /> Удалить узел
					</Button>
				</div>
			)}
		</div>
	);
}

function NodeForm({
	node,
	patch,
	kind,
}: {
	node: PipelineFlowNode;
	patch: NodePatchApi;
	kind: PipelineNodeKind;
}) {
	switch (kind) {
		case "agent_run":
			return <AgentNodeForm node={node} patch={patch} />;
		case "loop":
			return <LoopNodeForm node={node} patch={patch} />;
		case "human_approval":
			return <ConfirmationNodeForm node={node} patch={patch} />;
		case "response":
			return <FinalNodeForm node={node} patch={patch} />;
		case "start":
			return <StartNodeForm />;
		default:
			return null;
	}
}

/**
 * Controlled inline-rename input. Commits the trimmed value on blur/Enter;
 * Escape or an empty/whitespace value reverts to the prior name (never the block
 * id). Re-seeds when remounted under a new key (selection change).
 */
function InlineRename({
	initial,
	onCommit,
}: {
	initial: string;
	onCommit: (name: string) => void;
}) {
	const [value, setValue] = useState(initial);

	// Keep the field in sync if the underlying label changes out from under us
	// (e.g. an external save) while this node stays selected.
	useEffect(() => {
		setValue(initial);
	}, [initial]);

	const commit = () => {
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			setValue(initial);
			return;
		}
		onCommit(trimmed);
	};

	return (
		<Input
			variant="ghost"
			className="h-6 px-0 py-0 text-sm font-medium"
			aria-label="Имя узла"
			value={value}
			maxLength={120}
			onChange={(e) => setValue(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.currentTarget.blur();
				} else if (e.key === "Escape") {
					setValue(initial);
					e.currentTarget.blur();
				}
			}}
		/>
	);
}
