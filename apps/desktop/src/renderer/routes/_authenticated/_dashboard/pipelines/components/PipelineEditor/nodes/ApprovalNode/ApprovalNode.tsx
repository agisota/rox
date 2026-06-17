import type { NodeProps } from "@rox/ui/ai-elements/flow";
import {
	Node,
	NodeContent,
	NodeDescription,
	NodeHeader,
	NodeTitle,
} from "@rox/ui/ai-elements/node";
import { ShieldCheck } from "lucide-react";
import type { PipelineFlowNode } from "../../graph-adapter";

/**
 * A human-approval gate. At run time the executor pauses here and records an
 * `approval_requests` row the inbox resolves — pipelines inherit approval gates
 * from the Automation Fabric for free.
 */
export function ApprovalNode({ data, selected }: NodeProps<PipelineFlowNode>) {
	return (
		<Node
			handles={{ target: true, source: true }}
			className={selected ? "ring-2 ring-primary" : undefined}
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
			</NodeContent>
		</Node>
	);
}
