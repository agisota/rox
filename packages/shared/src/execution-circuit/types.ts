/**
 * Execution Circuit — domain model (#37).
 *
 * A task is modelled as a typed transition between states rather than a
 * free-form agent session: a current state, a target state, and the
 * transitions (with the context/tools/constraints — the "execution monad" —
 * and validators) needed to get there. This module is the pure, dependency-free
 * core (types + validation + monad-completeness + prompt compiler). Persistence
 * (Drizzle), the tRPC API, and UI are separate slices built on top of this.
 */

export type ExecutionCircuitStatus =
	| "draft"
	| "ready"
	| "running"
	| "blocked"
	| "completed"
	| "failed"
	| "cancelled";

export type TransitionRunStatus =
	| "pending"
	| "running"
	| "blocked"
	| "completed"
	| "failed"
	| "cancelled";

export interface StateSpec {
	id: string;
	name: string;
	description: string;
	assertions: string[];
	evidenceRefs?: string[];
}

export interface EventSpec {
	id: string;
	name: string;
	description: string;
	required: boolean;
	evidenceHint?: string;
}

export type RuntimeBindingKind =
	| "workspace"
	| "worktree"
	| "terminal"
	| "external"
	| "unspecified";

export interface RuntimeBindingSpec {
	kind: RuntimeBindingKind;
	workspaceId?: string;
	projectId?: string;
	branch?: string;
	worktreePath?: string;
	agent?: string;
	commands?: string[];
	notes?: string;
}

export interface ExecutionMonadSpec {
	contextRefs: string[];
	tools: string[];
	permissions: string[];
	constraints: string[];
	memoryRefs: string[];
	budget?: {
		maxMinutes?: number;
		maxToolCalls?: number;
	};
	qualityCriteria: string[];
}

export type OutputContractFormat =
	| "markdown"
	| "json"
	| "diff"
	| "commit"
	| "pr"
	| "artifact";

export interface OutputContractSpec {
	format: OutputContractFormat;
	requiredFields: string[];
	artifactRefs?: string[];
}

export type ValidatorKind =
	| "manual"
	| "command"
	| "test"
	| "lint"
	| "typecheck"
	| "schema"
	| "composite";

export interface ValidatorSpec {
	kind: ValidatorKind;
	description: string;
	command?: string;
	expected?: string;
	required: boolean;
}

export interface TransitionSpec {
	id: string;
	name: string;
	description: string;
	fromStateId: string;
	toStateId: string;
	requiredEvents: EventSpec[];
	runtime: RuntimeBindingSpec;
	monad: ExecutionMonadSpec;
	outputContract: OutputContractSpec;
	validators: ValidatorSpec[];
}

export interface ExecutionCircuitSpec {
	version: 1;
	id: string;
	taskId: string;
	title: string;
	status: ExecutionCircuitStatus;
	currentState: StateSpec;
	targetState: StateSpec;
	intermediateStates: StateSpec[];
	transitions: TransitionSpec[];
	createdAt?: string;
	updatedAt?: string;
}

/** Statuses for which a circuit must be fully specified (transitions, validators). */
export const FULLY_SPECIFIED_STATUSES: ReadonlySet<ExecutionCircuitStatus> =
	new Set(["ready", "running", "completed"]);

export interface CircuitValidationError {
	path: string;
	code: string;
	message: string;
}

export interface CircuitValidationResult {
	ok: boolean;
	errors: CircuitValidationError[];
}

export interface MonadCompleteness {
	score: number; // 0..100
	missing: string[];
	present: string[];
}
