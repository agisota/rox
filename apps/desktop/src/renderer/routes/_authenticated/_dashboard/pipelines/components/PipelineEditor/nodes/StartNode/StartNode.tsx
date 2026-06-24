import type { NodeProps } from "@rox/ui/ai-elements/flow";
import { Node, NodeHeader, NodeTitle } from "@rox/ui/ai-elements/node";
import { Play } from "lucide-react";
import type { PipelineFlowNode } from "../../graph-adapter";
import { runStatusClass } from "../node-run-status";

/**
 * The pipeline entry node. A pipeline has exactly one start; it has only a
 * source handle (nothing flows into it) and seeds the accumulating context with
 * the originating message at run time.
 */
export function StartNode({ data, selected }: NodeProps<PipelineFlowNode>) {
	return (
		<Node
			handles={{ target: false, source: true }}
			className={runStatusClass(data, selected)}
		>
			<NodeHeader>
				<div className="flex items-center gap-2">
					<Play className="size-4 text-emerald-500" />
					<NodeTitle>{data.label}</NodeTitle>
				</div>
			</NodeHeader>
		</Node>
	);
}
