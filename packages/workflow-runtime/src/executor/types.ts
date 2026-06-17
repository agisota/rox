import type {
	AccumulatedContext,
	ContextEntry,
	JsonSchema,
	RoxBlockState,
	RoxWorkflowState,
	RunCost,
	WorkflowRunError,
} from "@rox/workflow-core";

export type RunStatus =
	| "queued"
	| "running"
	| "waiting_approval"
	| "succeeded"
	| "failed"
	| "canceled"
	| "timeout";

export type StepStatus =
	| "pending"
	| "running"
	| "succeeded"
	| "failed"
	| "skipped"
	| "waiting_approval"
	| "canceled";

export interface StepRecord {
	blockId: string;
	blockType: string;
	blockName?: string;
	status: StepStatus;
	input?: Record<string, unknown>;
	output?: Record<string, unknown>;
	error?: WorkflowRunError;
	cost?: RunCost;
	/** Present for skill_call steps that spawned a child run. */
	childRunId?: string;
}

export interface BlockHandlerContext {
	blockId: string;
	block: RoxBlockState;
	/** Merged outputs of upstream blocks feeding this one. */
	input: Record<string, unknown>;
	/** The workflow run's top-level input. */
	runInput: Record<string, unknown>;
	/** Resolve a named secret (raw value; never store it in step records). */
	resolveSecret: (key: string) => string | undefined;
}

export interface BlockHandlerResult {
	output?: Record<string, unknown>;
	/** For condition/switch blocks: the output handle that fired. */
	handle?: string;
	error?: WorkflowRunError;
}

export type BlockHandler = (
	ctx: BlockHandlerContext,
) => BlockHandlerResult | Promise<BlockHandlerResult>;

export interface RunRecorder {
	recordStep(step: StepRecord): void | Promise<void>;
}

export interface SkillCallResult {
	output?: Record<string, unknown>;
	error?: WorkflowRunError;
	childRunId?: string;
}

export type SkillCallResolver = (
	slug: string,
	input: Record<string, unknown>,
) => SkillCallResult | Promise<SkillCallResult>;

/**
 * Request handed to the injected agent-run resolver for an `agent_run` block.
 * Carries the node's role reference plus the accumulating context (seed message
 * + every prior agent node's output) the agent should see.
 */
export interface AgentRunRequest {
	/** The pipeline graph node id (RoxBlockState id) being run. */
	blockId: string;
	/** `skills(kind="agent")` slug whose `agentConfig` is the role preset. */
	roleSkillSlug: string;
	/** Optional per-node prompt that extends/overrides the role system prompt. */
	promptTemplate?: string;
	/** Merged upstream output feeding this node. */
	input: Record<string, unknown>;
	/** The message + accumulating context the node receives (see design §5). */
	context: AccumulatedContext;
}

/** Result returned by the agent-run resolver for an `agent_run` block. */
export interface AgentRunResultPort {
	/** Node output, e.g. `{ message, artifacts? }`. */
	output?: Record<string, unknown>;
	/** Entries to append to the accumulating context for downstream nodes. */
	appendedContext?: ContextEntry[];
	/** Reference to the spawned chat/terminal session, when one was created. */
	childRunRef?: { kind: "chat" | "terminal"; sessionId: string };
	error?: WorkflowRunError;
}

/**
 * Resolves an `agent_run` block to an agent execution (chat in-process or CLI in
 * a worktree). Injected by the run-service so the executor stays DB-free and
 * host-free (mirrors {@link SkillCallResolver}).
 */
export type AgentRunResolver = (
	req: AgentRunRequest,
) => AgentRunResultPort | Promise<AgentRunResultPort>;

/**
 * Notification emitted after an `agent_run` block completes successfully. The
 * executor stays DB-free + dispatcher-free; the run-service injects
 * {@link ExecuteOptions.onAgentRunFinished} and turns this into the cross-run
 * `agent_run_finished` pipeline event (and a `file_or_artifact_created` event per
 * produced artifact). This is the in-run emit seam from design §4.3 — the
 * complement to the host `agent:lifecycle` Stop emit for CLI agents.
 */
export interface AgentRunFinishedInfo {
	/** The pipeline graph node id (RoxBlockState id) that finished. */
	blockId: string;
	/** `skills(kind="agent")` slug of the role that ran. */
	roleSkillSlug: string;
	/** Node output (`{ message, artifacts? }`). */
	output: Record<string, unknown>;
	/** Reference to the spawned chat/terminal session, when one was created. */
	childRunRef?: { kind: "chat" | "terminal"; sessionId: string };
}

/**
 * Optional sink invoked once per successful `agent_run` block. Fire-and-forget by
 * contract: implementations own their error handling and never throw back into
 * the executor loop.
 */
export type AgentRunFinishedHook = (info: AgentRunFinishedInfo) => void;

export interface ExecuteOptions {
	/** Per-block-type handlers. Built-ins (start/response) are provided. */
	handlers?: Record<string, BlockHandler>;
	recorder?: RunRecorder;
	/** Secret store; values are redacted from recorded step payloads. */
	secrets?: Record<string, string>;
	/** Resolve `skill_call:<slug>` to a child run. */
	resolveSkillCall?: SkillCallResolver;
	/** Resolve an `agent_run` block to an agent execution (chat or CLI). */
	resolveAgentRun?: AgentRunResolver;
	/**
	 * Invoked after each `agent_run` block succeeds. The run-service uses this to
	 * emit the `agent_run_finished` (+ per-artifact `file_or_artifact_created`)
	 * pipeline events without coupling the executor to the dispatcher (§4.3).
	 */
	onAgentRunFinished?: AgentRunFinishedHook;
	/**
	 * Seeds the run's accumulating context (message + transcript) threaded into
	 * every `agent_run` node. Defaults to an empty context when omitted.
	 */
	initialContext?: AccumulatedContext;
	/**
	 * Node-entry dispatch: begin execution AT this node instead of the `start`
	 * block. Used by event triggers that target a specific pipeline node (the
	 * trigger resolves to a `pipeline_triggers.targetNodeId`). The entry node is
	 * seeded with `runInput` exactly as `start` would be, and only nodes reachable
	 * from it run; upstream nodes are skipped. When omitted, the run starts at the
	 * single `start` block (legacy behavior). Unknown ids fall back to `start`.
	 */
	entryNodeId?: string;
	/** Validate the final output against this schema when set. */
	outputSchema?: JsonSchema;
	/** Signal cooperative cancellation. */
	isCanceled?: () => boolean;
	/**
	 * Resolved human-approval decisions keyed by approval block id. Resume works
	 * by re-executing the (idempotent) graph with the now-resolved approvals:
	 * "approved" passes the gate through, "rejected" prunes the gated branch, and
	 * an unresolved approval pauses the run again.
	 */
	approvals?: Record<string, "approved" | "rejected">;
}

export interface RunResult {
	status: RunStatus;
	output?: Record<string, unknown>;
	error?: WorkflowRunError;
	steps: StepRecord[];
	/**
	 * The accumulating context after the run, when any `agent_run` node executed
	 * (or `initialContext` was supplied). Persisted to
	 * `workflow_runs.accumulatedContext` by the run-service.
	 */
	accumulatedContext?: AccumulatedContext;
	/** Set when status === "waiting_approval". */
	pendingApproval?: {
		blockId: string;
		title?: string;
		payload?: Record<string, unknown>;
	};
}

export type { RoxWorkflowState };
