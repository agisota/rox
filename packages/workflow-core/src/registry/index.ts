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
import { manualInputNodeType } from "./nodes/input/manualInput";
import { scheduleNodeType } from "./nodes/input/schedule";
import { startNodeType } from "./nodes/input/start";
import { webhookNodeType } from "./nodes/input/webhook";
import { conditionNodeType } from "./nodes/logic/condition";
import { gateNodeType } from "./nodes/logic/gate";
import { humanApprovalNodeType } from "./nodes/logic/humanApproval";
import { loopNodeType } from "./nodes/logic/loop";
import { mergeNodeType } from "./nodes/logic/merge";
import { switchNodeType } from "./nodes/logic/switch";
import { dbWriteNodeType } from "./nodes/output/dbWrite";
import { notifyNodeType } from "./nodes/output/notify";
import { responseNodeType } from "./nodes/output/response";
import type { NodeTypeDefinition } from "./nodeTypeDefinition";
import { registerNodeType } from "./nodeTypeRegistry";

/**
 * The built-in node types (the 5 that already execute today, migrated into
 * registry modules). Ordered start → agent → loop → approval → response. These
 * have working executors; everything below in {@link CATALOG_NODE_TYPES} is
 * design-time only in this slice (no executor yet).
 */
export const BUILTIN_NODE_TYPES: NodeTypeDefinition[] = [
	startNodeType,
	agentRunNodeType,
	loopNodeType,
	humanApprovalNodeType,
	responseNodeType,
];

/**
 * The catalog node types (Slice 1b) — declarative, design-time definitions for
 * Logic, Input, and Output categories. They surface in the palette / inspector /
 * validator from the shared registry; per-type execution is a later slice.
 */
export const CATALOG_NODE_TYPES: NodeTypeDefinition[] = [
	// Input
	manualInputNodeType,
	webhookNodeType,
	scheduleNodeType,
	// Logic
	conditionNodeType,
	switchNodeType,
	mergeNodeType,
	gateNodeType,
	// Output
	notifyNodeType,
	dbWriteNodeType,
];

for (const def of BUILTIN_NODE_TYPES) registerNodeType(def);
for (const def of CATALOG_NODE_TYPES) registerNodeType(def);

export * from "./nodeCategory";
export * from "./nodeTypeDefinition";
export * from "./nodeTypeRegistry";
export * from "./validateNodeConfig";
export {
	agentRunNodeType,
	conditionNodeType,
	dbWriteNodeType,
	gateNodeType,
	humanApprovalNodeType,
	loopNodeType,
	manualInputNodeType,
	mergeNodeType,
	notifyNodeType,
	responseNodeType,
	scheduleNodeType,
	startNodeType,
	switchNodeType,
	webhookNodeType,
};
