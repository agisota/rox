"use client";

import type { NodeProps } from "@rox/ui/ai-elements/flow";
import {
	Node,
	NodeContent,
	NodeDescription,
	NodeHeader,
	NodeTitle,
} from "@rox/ui/ai-elements/node";
import { Flag } from "lucide-react";
import type { PipelineFlowNode } from "../../graph-adapter";
import { runStatusClass } from "../node-run-status";

/**
 * A terminal response node — the pipeline's final output. Only has a target
 * handle (nothing flows out). The accumulated context at this point is the
 * pipeline result.
 */
export function ResponseNode({ data, selected }: NodeProps<PipelineFlowNode>) {
	return (
		<Node
			handles={{ target: true, source: false }}
			className={runStatusClass(data, selected)}
		>
			<NodeHeader>
				<div className="flex items-center gap-2">
					<Flag className="size-4 text-rose-500" />
					<NodeTitle>{data.label}</NodeTitle>
				</div>
				<NodeDescription>Финал</NodeDescription>
			</NodeHeader>
			<NodeContent>
				<span className="text-xs text-muted-foreground">
					Результат пайплайна
				</span>
			</NodeContent>
		</Node>
	);
}
