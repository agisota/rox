import type {
	JsonSchema,
	RunCost,
	SupersetBlockState,
	SupersetWorkflowState,
	WorkflowRunError,
} from "@superset/workflow-core";

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
	block: SupersetBlockState;
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

export interface ExecuteOptions {
	/** Per-block-type handlers. Built-ins (start/response) are provided. */
	handlers?: Record<string, BlockHandler>;
	recorder?: RunRecorder;
	/** Secret store; values are redacted from recorded step payloads. */
	secrets?: Record<string, string>;
	/** Resolve `skill_call:<slug>` to a child run. */
	resolveSkillCall?: SkillCallResolver;
	/** Validate the final output against this schema when set. */
	outputSchema?: JsonSchema;
	/** Signal cooperative cancellation. */
	isCanceled?: () => boolean;
}

export interface RunResult {
	status: RunStatus;
	output?: Record<string, unknown>;
	error?: WorkflowRunError;
	steps: StepRecord[];
	/** Set when status === "waiting_approval". */
	pendingApproval?: {
		blockId: string;
		title?: string;
		payload?: Record<string, unknown>;
	};
}

export type { SupersetWorkflowState };
