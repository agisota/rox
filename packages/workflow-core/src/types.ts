/**
 * The Rox-native workflow graph contract.
 *
 * This shape is intentionally compatible-in-spirit with Sim's `WorkflowState`
 * (blocks / edges / loops / parallels / variables / metadata) so that Sim
 * workflows can be imported via `@rox/workflow-sim-adapter`, but Rox
 * owns the canonical definition here.
 */

/** Built-in block types understood by the runtime. Skill calls use the
 * dynamic `skill_call:<slug>` convention and are not enumerated here. */
export type CoreBlockType =
	| "start"
	| "response"
	| "condition"
	| "switch"
	| "loop"
	| "parallel"
	| "wait"
	| "delay"
	| "human_approval"
	| "skill_call"
	| "agent_run"
	| "error_boundary";

export interface RoxBlockState {
	/** Block type. Either a {@link CoreBlockType} or a `skill_call:<slug>` id. */
	type: string;
	/** Optional human-facing name shown on the canvas. */
	name?: string;
	/** Disabled blocks are skipped at runtime and excluded from reachability. */
	enabled?: boolean;
	/** Editor-only canvas position. */
	position?: { x: number; y: number };
	/** Arbitrary per-block configuration (sub-blocks / field values). */
	subBlocks?: Record<string, unknown>;
	/** Free-form metadata (e.g. `sourcePromptCardId` for prompt-board traceability). */
	metadata?: Record<string, unknown>;
}

export interface RoxEdge {
	id?: string;
	source: string;
	target: string;
	/** Named output handle on the source (e.g. `"true"` / `"false"` for a condition). */
	sourceHandle?: string;
	targetHandle?: string;
}

export interface RoxVariable {
	type: "string" | "number" | "boolean" | "json";
	value?: unknown;
}

export interface RoxLoop {
	nodes: string[];
	maxIterations?: number;
}

export interface RoxParallel {
	nodes: string[];
}

export interface RoxWorkflowMetadata {
	name: string;
	description?: string;
}

export interface RoxWorkflowState {
	id?: string;
	blocks: Record<string, RoxBlockState>;
	edges: RoxEdge[];
	variables: Record<string, RoxVariable>;
	loops: Record<string, RoxLoop>;
	parallels: Record<string, RoxParallel>;
	metadata: RoxWorkflowMetadata;
}

// ---------------------------------------------------------------------------
// Supporting payload types
//
// These are the canonical shapes for jsonb columns persisted by `@rox/db`
// and for values passed across the tRPC boundary. Keeping them here (the pure
// domain layer) lets every consumer share one definition.
// ---------------------------------------------------------------------------

/**
 * A JSON Schema document (draft 2020-12 subset). Used for skill input/output
 * contracts stored in the database. Intentionally permissive — validation lives
 * in `./schema`.
 */
export interface JsonSchema {
	type?: string;
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema | JsonSchema[];
	required?: string[];
	enum?: unknown[];
	format?: string;
	description?: string;
	default?: unknown;
	[keyword: string]: unknown;
}

/** Result of validating a workflow graph without executing it. */
export interface WorkflowValidationResult {
	valid: boolean;
	/** Both errors and warnings; `valid` is false iff any error is present. */
	issues: import("./errors").WorkflowIssue[];
	/** Deterministic execution order of enabled, reachable blocks (when valid). */
	executionPlan?: string[];
}

/** Structured error captured on a failed run or step. */
export interface WorkflowRunError {
	code: string;
	message: string;
	/** Coarse classification, e.g. `SIM_SIDECAR_UNAVAILABLE`, `POLICY_VIOLATION`. */
	kind?: string;
	blockId?: string;
	details?: Record<string, unknown>;
}

/** Token / money accounting for a run or step. */
export interface RunCost {
	inputTokens?: number;
	outputTokens?: number;
	usd?: number;
}

/** A loose reference to any object in the Rox object graph. */
export interface ObjectRef {
	/** Object type, e.g. `repo` / `project` / `task`. Loosely typed on purpose. */
	type: string;
	id: string;
}
