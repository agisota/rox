"use client";

import type { NodeProps } from "@rox/ui/ai-elements/flow";
import { Handle, Position } from "@rox/ui/ai-elements/flow";
import {
	Node,
	NodeContent,
	NodeDescription,
	NodeHeader,
	NodeTitle,
} from "@rox/ui/ai-elements/node";
import { ShieldCheck } from "lucide-react";
import type { PipelineFlowNode } from "../../graph-adapter";
import { runStatusClass } from "../node-run-status";

/**
 * A human-approval gate. At run time the executor pauses here and records an
 * `approval_requests` row the inbox resolves — pipelines inherit approval gates
 * from the Automation Fabric for free.
 *
 * Branch ports (dify/sim parity): instead of a single source handle this node
 * exposes TWO labelled source handles — `approved` (Да, emerald) and `rejected`
 * (Нет, red). Edges carry the handle id (`RoxEdge.sourceHandle`), which already
 * round-trips through the graph adapter, so a "yes" path and a "no" path can
 * diverge from the same gate.
 */
export function ApprovalNode({ data, selected }: NodeProps<PipelineFlowNode>) {
	return (
		<Node
			handles={{ target: true, source: false }}
			className={runStatusClass(data, selected)}
		>
			<NodeHeader>
				<div className="flex items-center gap-2">
					<ShieldCheck className="size-4 text-amber-500" />
					<NodeTitle>{data.label}</NodeTitle>
				</div>
				<NodeDescription>Гейт подтверждения</NodeDescription>
			</NodeHeader>
			<NodeContent>
				<span className="text-xs text-muted-foreground">
					Пауза до ручного подтверждения
				</span>
				{/* Branch labels mirror the two source handles below. */}
				<div className="mt-2 flex items-center justify-end gap-3 text-[10px] font-medium">
					<span className="text-emerald-500">Да</span>
					<span className="text-rose-500">Нет</span>
				</div>
			</NodeContent>
			{/* Two source handles, vertically split on the right edge. */}
			<Handle
				type="source"
				id="approved"
				position={Position.Right}
				style={{ top: "38%", background: "var(--color-emerald-500, #10b981)" }}
				aria-label="Ветка: подтверждено"
			/>
			<Handle
				type="source"
				id="rejected"
				position={Position.Right}
				style={{ top: "70%", background: "var(--color-rose-500, #f43f5e)" }}
				aria-label="Ветка: отклонено"
			/>
		</Node>
	);
}
