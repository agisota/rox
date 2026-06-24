"use client";

import { Handle, type NodeProps, Position } from "@rox/ui/ai-elements/flow";
import { Badge } from "@rox/ui/badge";
import { cn } from "@rox/ui/utils";
import {
	BRANCH_TONE_COLOR,
	categoryAccent,
	getNodeType,
	NODE_CATEGORY_LABEL,
	type NodePort,
	portColor,
	portTone,
} from "@rox/workflow-core";
import type { PipelineFlowNode } from "../../graph-adapter";
import { nodeConfigSummary } from "./nodeConfigSummary";
import { resolveNodeIcon } from "./nodeIcons";

/**
 * The registry-driven canvas node — one renderer for ANY node type that doesn't
 * have a dedicated (legacy) component. Reads the type's `render` meta, category,
 * and typed ports from the shared `@rox/workflow-core` registry, so adding a node
 * module surfaces a fully-styled node automatically (dify/sim parity).
 *
 * Visual language: a category-tinted header strip (icon chip + title + category
 * label), typed input/output handles distributed along the left/right edges
 * (branch out-ports — true/false, allowed/blocked, … — are colour-coded and
 * labelled), and a compact config summary. Selected → ring; disabled → dimmed.
 *
 * Cache-first (AGENTS.md #9): everything renders from `data` (the persisted
 * block); no async reads here.
 */
export function RegistryNode({ data, selected }: NodeProps<PipelineFlowNode>) {
	const def = getNodeType(data.blockType) ?? getNodeType(data.kind);
	const accent = def
		? categoryAccent(def.category)
		: categoryAccent("input" as never);
	const Icon = resolveNodeIcon(def?.render.icon);
	const inputs: NodePort[] = def?.inputs ?? [{ name: "in" }];
	const outputs: NodePort[] = def?.outputs ?? [{ name: "out" }];
	const summary = def ? nodeConfigSummary(def, data.subBlocks) : [];
	const disabled = data.enabled === false;
	const categoryLabel = def ? NODE_CATEGORY_LABEL[def.category] : undefined;
	const typeLabel = def?.label ?? data.kind;
	const isBranching = outputs.length > 1;

	return (
		<div
			className={cn(
				"group relative w-64 rounded-lg border bg-card text-card-foreground shadow-sm transition-all",
				"hover:-translate-y-px hover:shadow-md",
				selected
					? "border-primary ring-2 ring-primary/60"
					: "border-border hover:border-primary/40",
				disabled && "opacity-60",
			)}
			data-testid="registry-node"
			data-node-type={data.blockType}
		>
			{/* Typed input handles (left edge). */}
			{inputs.map((port, i) => (
				<PortHandle
					key={`in-${port.name}`}
					port={port}
					type="target"
					position={Position.Left}
					index={i}
					count={inputs.length}
				/>
			))}

			{/* Header strip — category-tinted. */}
			<div
				className={cn(
					"flex items-center gap-2 rounded-t-lg border-b px-3 py-2",
					accent.tintClass,
					accent.borderClass,
				)}
			>
				<span
					className={cn(
						"flex size-7 shrink-0 items-center justify-center rounded-md border bg-card/70",
						accent.borderClass,
					)}
				>
					<Icon className={cn("size-4", accent.textClass)} />
				</span>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium leading-tight">
						{data.label}
					</p>
					{categoryLabel && (
						<p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
							{categoryLabel} · {typeLabel}
						</p>
					)}
				</div>
				{disabled && (
					<Badge variant="outline" className="shrink-0 text-[10px]">
						выкл
					</Badge>
				)}
			</div>

			{/* Body — role badge, config summary, branch legend. */}
			<div className="flex flex-col gap-1.5 px-3 py-2">
				{data.roleSlug ? (
					<Badge variant="secondary" className="w-fit font-mono text-[11px]">
						{data.roleSlug}
					</Badge>
				) : null}

				{summary.length > 0 ? (
					<dl className="flex flex-col gap-0.5">
						{summary.map((line) => (
							<div
								key={line.label}
								className="flex items-baseline justify-between gap-2 text-[11px]"
							>
								<dt className="shrink-0 text-muted-foreground">{line.label}</dt>
								<dd className="truncate text-right font-medium">
									{line.value}
								</dd>
							</div>
						))}
					</dl>
				) : def?.description ? (
					<p className="text-[11px] text-muted-foreground">{def.description}</p>
				) : null}

				{/* Branch out-port legend (only when the node fans out). */}
				{isBranching && (
					<div className="mt-0.5 flex flex-wrap gap-1.5 border-t pt-1.5">
						{outputs.map((port) => (
							<span
								key={`legend-${port.name}`}
								className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
							>
								<span
									className="size-1.5 rounded-full"
									style={{ backgroundColor: portColor(port) }}
								/>
								{port.label ?? port.name}
							</span>
						))}
					</div>
				)}
			</div>

			{/* Typed output handles (right edge). */}
			{outputs.map((port, i) => (
				<PortHandle
					key={`out-${port.name}`}
					port={port}
					type="source"
					position={Position.Right}
					index={i}
					count={outputs.length}
				/>
			))}
		</div>
	);
}

/**
 * A single typed port handle, vertically distributed along its edge and coloured
 * by branch tone. `required` inputs get a ring so a missing wire reads as
 * "needs connection".
 */
function PortHandle({
	port,
	type,
	position,
	index,
	count,
}: {
	port: NodePort;
	type: "source" | "target";
	position: Position;
	index: number;
	count: number;
}) {
	// Distribute N handles evenly across the node height (percent offsets).
	const top = count <= 1 ? 50 : ((index + 1) / (count + 1)) * 100;
	const tone = portTone(port);
	const color = tone === "neutral" ? "var(--primary)" : BRANCH_TONE_COLOR[tone];
	return (
		<Handle
			id={port.name}
			type={type}
			position={position}
			style={{
				top: `${top}%`,
				width: 10,
				height: 10,
				background: color,
				border: "2px solid var(--card)",
				boxShadow: port.required ? `0 0 0 2px ${color}` : undefined,
			}}
			aria-label={port.label ?? port.name}
		/>
	);
}
