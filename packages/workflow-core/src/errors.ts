/**
 * Stable error codes for workflow-core graph + schema validation.
 *
 * These codes are part of the public contract: tRPC routers, the runtime, and
 * the UI all branch on them, so treat the string values as append-only.
 */
export const WorkflowErrorCode = {
	// Graph structure
	MISSING_START_BLOCK: "MISSING_START_BLOCK",
	MULTIPLE_START_BLOCKS: "MULTIPLE_START_BLOCKS",
	INVALID_EDGE_SOURCE: "INVALID_EDGE_SOURCE",
	INVALID_EDGE_TARGET: "INVALID_EDGE_TARGET",
	CYCLE_DETECTED: "CYCLE_DETECTED",
	UNREACHABLE_BLOCK: "UNREACHABLE_BLOCK",
	DISABLED_BRIDGE_BLOCK: "DISABLED_BRIDGE_BLOCK",
	UNKNOWN_BLOCK_TYPE: "UNKNOWN_BLOCK_TYPE",
	// Node-type registry config
	MISSING_REQUIRED_CONFIG: "MISSING_REQUIRED_CONFIG",
	INVALID_NODE_CONFIG: "INVALID_NODE_CONFIG",
	MISSING_REQUIRED_PORT: "MISSING_REQUIRED_PORT",
	INCOMPATIBLE_PORT_TYPES: "INCOMPATIBLE_PORT_TYPES",
	// Skill / schema
	SKILL_INPUT_MAPPING_MISSING_FIELD: "SKILL_INPUT_MAPPING_MISSING_FIELD",
	INPUT_SCHEMA_VALIDATION_FAILED: "INPUT_SCHEMA_VALIDATION_FAILED",
	OUTPUT_SCHEMA_VALIDATION_FAILED: "OUTPUT_SCHEMA_VALIDATION_FAILED",
	NESTED_WORKFLOW_DEPTH_EXCEEDED: "NESTED_WORKFLOW_DEPTH_EXCEEDED",
	// Policy
	POLICY_VIOLATION: "POLICY_VIOLATION",
} as const;

export type WorkflowErrorCode =
	(typeof WorkflowErrorCode)[keyof typeof WorkflowErrorCode];

/**
 * A single validation problem found in a workflow graph or schema. Issues are
 * accumulated (not thrown) so the editor can surface every problem at once.
 */
export interface WorkflowIssue {
	code: WorkflowErrorCode;
	message: string;
	/** Block id the issue is anchored to, when applicable. */
	blockId?: string;
	/** Edge id the issue is anchored to, when applicable. */
	edgeId?: string;
	/** JSON path into an input/output payload, when applicable. */
	path?: string;
	severity: "error" | "warning";
}

/**
 * Thrown when workflow-core needs to fail loudly (programmer error / contract
 * breach) rather than return a collected issue list.
 */
export class WorkflowError extends Error {
	readonly code: WorkflowErrorCode;
	constructor(code: WorkflowErrorCode, message: string) {
		super(message);
		this.name = "WorkflowError";
		this.code = code;
	}
}
