/**
 * Node-type registry — the data-driven catalog the canvas palette, node render,
 * NodeInspector auto-form, and `validateGraph` all read from. Importing this
 * barrel registers the built-in node types into the shared {@link nodeTypeRegistry}
 * as a side effect (idempotent — re-registering replaces).
 *
 * Adding a node type = adding one module under `nodes/<category>/<type>.ts` and
 * registering it here. No other surface needs to change.
 */

import { agentRunNodeType } from "./nodes/ai/agentRun";
import { startNodeType } from "./nodes/input/start";
import { humanApprovalNodeType } from "./nodes/logic/humanApproval";
import { loopNodeType } from "./nodes/logic/loop";
import { responseNodeType } from "./nodes/output/response";
import type { NodeTypeDefinition } from "./nodeTypeDefinition";
import { registerNodeType } from "./nodeTypeRegistry";

/**
 * The built-in node types (the 5 that already execute today, migrated into
 * registry modules). Ordered start → agent → loop → approval → response.
 */
export const BUILTIN_NODE_TYPES: NodeTypeDefinition[] = [
	startNodeType,
	agentRunNodeType,
	loopNodeType,
	humanApprovalNodeType,
	responseNodeType,
];

for (const def of BUILTIN_NODE_TYPES) registerNodeType(def);

export * from "./nodeCategory";
export * from "./nodeTypeDefinition";
export * from "./nodeTypeRegistry";
export * from "./validateNodeConfig";
export {
	agentRunNodeType,
	humanApprovalNodeType,
	loopNodeType,
	responseNodeType,
	startNodeType,
};
