import type { PipelineFlowNode } from "../../graph-adapter";
import type { NodePatchApi } from "../useNodePatch";

/**
 * Common props for every per-type node sub-form. Each form reads INITIAL values
 * from `node.data` (display/seed only) and writes through `patch.patchNode`
 * (authoritative, debounced). Forms re-seed their local state when the selected
 * node id changes (the parent keys them by id).
 */
export type NodeFormProps = {
	node: PipelineFlowNode;
	patch: NodePatchApi;
};
