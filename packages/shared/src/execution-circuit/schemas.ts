import { z } from "zod";

export const executionCircuitStatusSchema = z.enum([
	"draft",
	"ready",
	"running",
	"blocked",
	"completed",
	"failed",
	"cancelled",
]);

export const transitionRunStatusSchema = z.enum([
	"pending",
	"running",
	"blocked",
	"completed",
	"failed",
	"cancelled",
]);

export const stateSpecSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string(),
	assertions: z.array(z.string()),
	evidenceRefs: z.array(z.string()).optional(),
});

export const eventSpecSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string(),
	required: z.boolean(),
	evidenceHint: z.string().optional(),
});

export const runtimeBindingSpecSchema = z.object({
	kind: z.enum([
		"workspace",
		"worktree",
		"terminal",
		"external",
		"unspecified",
	]),
	workspaceId: z.string().optional(),
	projectId: z.string().optional(),
	branch: z.string().optional(),
	worktreePath: z.string().optional(),
	agent: z.string().optional(),
	commands: z.array(z.string()).optional(),
	notes: z.string().optional(),
});

export const executionMonadSpecSchema = z.object({
	contextRefs: z.array(z.string()),
	tools: z.array(z.string()),
	permissions: z.array(z.string()),
	constraints: z.array(z.string()),
	memoryRefs: z.array(z.string()),
	budget: z
		.object({
			maxMinutes: z.number().positive().optional(),
			maxToolCalls: z.number().positive().optional(),
		})
		.optional(),
	qualityCriteria: z.array(z.string()),
});

export const outputContractSpecSchema = z.object({
	format: z.enum(["markdown", "json", "diff", "commit", "pr", "artifact"]),
	requiredFields: z.array(z.string()),
	artifactRefs: z.array(z.string()).optional(),
});

export const validatorSpecSchema = z.object({
	kind: z.enum([
		"manual",
		"command",
		"test",
		"lint",
		"typecheck",
		"schema",
		"composite",
	]),
	description: z.string(),
	command: z.string().optional(),
	expected: z.string().optional(),
	required: z.boolean(),
});

export const validatorExecutionStatusSchema = z.enum([
	"passed",
	"failed",
	"skipped",
]);

export const validatorExecutionRecordSchema = z.object({
	validatorIndex: z.number().int().nonnegative(),
	kind: validatorSpecSchema.shape.kind,
	description: z.string(),
	required: z.boolean(),
	command: z.string().optional(),
	status: validatorExecutionStatusSchema,
	startedAt: z.string().optional(),
	completedAt: z.string().optional(),
	exitCode: z.number().int().nullable().optional(),
	stdout: z.string().optional(),
	stderr: z.string().optional(),
	details: z.string(),
});

export const validatorExecutionSummarySchema = z.object({
	transitionRunId: z.string().min(1),
	passed: z.boolean(),
	details: z.string(),
	records: z.array(validatorExecutionRecordSchema),
});

export const transitionSpecSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string(),
	fromStateId: z.string().min(1),
	toStateId: z.string().min(1),
	requiredEvents: z.array(eventSpecSchema),
	runtime: runtimeBindingSpecSchema,
	monad: executionMonadSpecSchema,
	outputContract: outputContractSpecSchema,
	validators: z.array(validatorSpecSchema),
});

export const executionCircuitSpecSchema = z.object({
	version: z.literal(1),
	id: z.string().min(1),
	taskId: z.string().min(1),
	title: z.string().min(1),
	status: executionCircuitStatusSchema,
	currentState: stateSpecSchema,
	targetState: stateSpecSchema,
	intermediateStates: z.array(stateSpecSchema),
	transitions: z.array(transitionSpecSchema),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});

export const circuitValidationErrorSchema = z.object({
	path: z.string(),
	code: z.string(),
	message: z.string(),
});

export const circuitValidationResultSchema = z.object({
	ok: z.boolean(),
	errors: z.array(circuitValidationErrorSchema),
});

export const transitionRunOutputSchema = z.object({
	transition_id: z.string(),
	status: z.enum(["completed", "blocked", "failed"]),
	events_observed: z.array(z.string()),
	files_changed: z.array(z.string()),
	commands_run: z.array(z.string()),
	artifacts_produced: z.array(z.string()),
	validation_result: z.object({
		passed: z.boolean(),
		details: z.string(),
	}),
	remaining_risks: z.array(z.string()),
	next_recommended_transition: z.string().nullable(),
});

export const transitionValidationResultSchema = z.object({
	passed: z.boolean(),
	details: z.string(),
});

export const traceEventPayloadSchema = z.record(z.string(), z.unknown());

export type ExecutionCircuitStatus = z.infer<
	typeof executionCircuitStatusSchema
>;
export type TransitionRunStatus = z.infer<typeof transitionRunStatusSchema>;
export type StateSpec = z.infer<typeof stateSpecSchema>;
export type EventSpec = z.infer<typeof eventSpecSchema>;
export type RuntimeBindingSpec = z.infer<typeof runtimeBindingSpecSchema>;
export type ExecutionMonadSpec = z.infer<typeof executionMonadSpecSchema>;
export type OutputContractSpec = z.infer<typeof outputContractSpecSchema>;
export type ValidatorSpec = z.infer<typeof validatorSpecSchema>;
export type ValidatorExecutionStatus = z.infer<
	typeof validatorExecutionStatusSchema
>;
export type ValidatorExecutionRecord = z.infer<
	typeof validatorExecutionRecordSchema
>;
export type ValidatorExecutionSummary = z.infer<
	typeof validatorExecutionSummarySchema
>;
export type TransitionSpec = z.infer<typeof transitionSpecSchema>;
export type ExecutionCircuitSpec = z.infer<typeof executionCircuitSpecSchema>;
export type CircuitValidationError = z.infer<
	typeof circuitValidationErrorSchema
>;
export type CircuitValidationResult = z.infer<
	typeof circuitValidationResultSchema
>;
export type TransitionRunOutput = z.infer<typeof transitionRunOutputSchema>;
export type TransitionValidationResult = z.infer<
	typeof transitionValidationResultSchema
>;
export type TraceEventPayload = z.infer<typeof traceEventPayloadSchema>;
