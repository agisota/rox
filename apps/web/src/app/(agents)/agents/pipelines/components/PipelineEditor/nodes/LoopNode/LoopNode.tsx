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
import { Repeat } from "lucide-react";
import type { PipelineFlowNode } from "../../graph-adapter";
import { runStatusClass } from "../node-run-status";

/**
 * A loop node — repeats its body up to `maxIterations` (read from subBlocks).
 * Loop membership lives in `RoxWorkflowState.loops`; this node marks the loop's
 * control point on the canvas.
 *
 * Branch ports (dify/sim parity): two labelled source handles — `body` (Тело,
 * sky) feeds the iterated sub-chain, `exit` (Выход, muted) continues once the
 * loop finishes. The handle id is persisted on the edge (`RoxEdge.sourceHandle`).
 */
export function LoopNode({ data, selected }: NodeProps<PipelineFlowNode>) {
	const maxIterations =
		typeof data.subBlocks?.maxIterations === "number"
			? data.subBlocks.maxIterations
			: undefined;
	return (
		<Node
			handles={{ target: true, source: false }}
			className={runStatusClass(data, selected)}
		>
			<NodeHeader>
				<div className="flex items-center gap-2">
					<Repeat className="size-4 text-sky-500" />
					<NodeTitle>{data.label}</NodeTitle>
				</div>
				<NodeDescription>Цикл</NodeDescription>
			</NodeHeader>
			<NodeContent>
				<span className="text-xs text-muted-foreground">
					{maxIterations !== undefined
						? `До ${maxIterations} итераций`
						: "Повтор тела цикла"}
				</span>
				<div className="mt-2 flex items-center justify-end gap-3 text-[10px] font-medium">
					<span className="text-sky-500">Тело</span>
					<span className="text-muted-foreground">Выход</span>
				</div>
			</NodeContent>
			<Handle
				type="source"
				id="body"
				position={Position.Right}
				style={{ top: "38%", background: "var(--color-sky-500, #0ea5e9)" }}
				aria-label="Ветка: тело цикла"
			/>
			<Handle
				type="source"
				id="exit"
				position={Position.Right}
				style={{ top: "70%", background: "var(--muted-foreground)" }}
				aria-label="Ветка: выход из цикла"
			/>
		</Node>
	);
}
