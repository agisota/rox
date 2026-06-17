import type { NodeProps } from "@rox/ui/ai-elements/flow";
import {
	Node,
	NodeContent,
	NodeDescription,
	NodeHeader,
	NodeTitle,
} from "@rox/ui/ai-elements/node";
import { Repeat } from "lucide-react";
import type { PipelineFlowNode } from "../../graph-adapter";

/**
 * A loop node — repeats its body up to `maxIterations` (read from subBlocks).
 * Loop membership lives in `RoxWorkflowState.loops`; this node marks the loop's
 * control point on the canvas.
 */
export function LoopNode({ data, selected }: NodeProps<PipelineFlowNode>) {
	const maxIterations =
		typeof data.subBlocks?.maxIterations === "number"
			? data.subBlocks.maxIterations
			: undefined;
	return (
		<Node
			handles={{ target: true, source: true }}
			className={selected ? "ring-2 ring-primary" : undefined}
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
					{maxIterations ? `До ${maxIterations} итераций` : "Повтор тела цикла"}
				</span>
			</NodeContent>
		</Node>
	);
}
