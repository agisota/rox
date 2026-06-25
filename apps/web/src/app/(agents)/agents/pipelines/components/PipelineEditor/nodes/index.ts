import { Edge } from "@rox/ui/ai-elements/edge";
import type { EdgeTypes, NodeTypes } from "@rox/ui/ai-elements/flow";
import { BranchEdge } from "../edges/BranchEdge";
import { AgentRoleNode } from "./AgentRoleNode";
import { ApprovalNode } from "./ApprovalNode";
import { LoopNode } from "./LoopNode";
import { RegistryNode } from "./RegistryNode";
import { ResponseNode } from "./ResponseNode";
import { StartNode } from "./StartNode";

/**
 * xyflow node-type registry for the pipeline canvas. Keys match the `type`
 * assigned by `stateToNodes` in the graph adapter. The five legacy types keep
 * their dedicated renderers; every other registry (or unknown) type renders
 * through the generic, registry-driven `RegistryNode` (`pipelineRegistry`).
 */
export const PIPELINE_NODE_TYPES: NodeTypes = {
	pipelineStart: StartNode,
	pipeline_agent_run: AgentRoleNode,
	pipeline_human_approval: ApprovalNode,
	pipeline_loop: LoopNode,
	pipeline_response: ResponseNode,
	pipelineRegistry: RegistryNode,
};

/**
 * Edge registry. `branch` colours the stroke by the source out-port (success /
 * failure / neutral) and labels named branches; `animated` is the original
 * flowing edge kept for back-compat.
 */
export const PIPELINE_EDGE_TYPES: EdgeTypes = {
	animated: Edge.Animated,
	branch: BranchEdge,
};

export {
	AgentRoleNode,
	ApprovalNode,
	LoopNode,
	RegistryNode,
	ResponseNode,
	StartNode,
};
