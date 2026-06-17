import { Edge } from "@rox/ui/ai-elements/edge";
import type { EdgeTypes, NodeTypes } from "@rox/ui/ai-elements/flow";
import { AgentRoleNode } from "./AgentRoleNode";
import { ApprovalNode } from "./ApprovalNode";
import { LoopNode } from "./LoopNode";
import { ResponseNode } from "./ResponseNode";
import { StartNode } from "./StartNode";

/**
 * xyflow node-type registry for the pipeline canvas. Keys match the `type`
 * assigned by `stateToNodes` in the graph adapter (`pipelineStart`,
 * `pipeline_agent_run`, …).
 */
export const PIPELINE_NODE_TYPES: NodeTypes = {
	pipelineStart: StartNode,
	pipeline_agent_run: AgentRoleNode,
	pipeline_human_approval: ApprovalNode,
	pipeline_loop: LoopNode,
	pipeline_response: ResponseNode,
};

/** Edge registry — reuses the shared animated edge primitive. */
export const PIPELINE_EDGE_TYPES: EdgeTypes = {
	animated: Edge.Animated,
};

export { AgentRoleNode, ApprovalNode, LoopNode, ResponseNode, StartNode };
