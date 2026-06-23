"use client";

import type { NodeProps } from "@rox/ui/ai-elements/flow";
import {
	Node,
	NodeContent,
	NodeDescription,
	NodeHeader,
	NodeTitle,
} from "@rox/ui/ai-elements/node";
import { Badge } from "@rox/ui/badge";
import { Bot } from "lucide-react";
import type { PipelineFlowNode } from "../../graph-adapter";

/**
 * An agent-role node — the workhorse of a pipeline. Renders the bound role slug
 * (or a "pick a role" hint) and selection state. Editing the bound role happens
 * in the side panels; this node is the canvas representation.
 */
export function AgentRoleNode({ data, selected }: NodeProps<PipelineFlowNode>) {
	return (
		<Node
			handles={{ target: true, source: true }}
			className={selected ? "ring-2 ring-primary" : undefined}
		>
			<NodeHeader>
				<div className="flex items-center gap-2">
					<Bot className="size-4 text-primary" />
					<NodeTitle>{data.label}</NodeTitle>
				</div>
				<NodeDescription>Агент-роль</NodeDescription>
			</NodeHeader>
			<NodeContent>
				{data.roleSlug ? (
					<Badge variant="secondary" className="font-mono text-xs">
						{data.roleSlug}
					</Badge>
				) : (
					<span className="text-xs text-muted-foreground">
						Выберите роль в панели
					</span>
				)}
				{data.enabled === false && (
					<Badge variant="outline" className="ml-2 text-xs">
						выключен
					</Badge>
				)}
			</NodeContent>
		</Node>
	);
}
