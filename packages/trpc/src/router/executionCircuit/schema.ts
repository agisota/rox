import { executionCircuitSpecSchema } from "@rox/workflow-core";
import { z } from "zod";

export const taskIdSchema = z.object({ taskId: z.string().uuid() });

export const circuitIdSchema = z.object({ circuitId: z.string().uuid() });

export const createDraftForTaskSchema = z.object({
	taskId: z.string().uuid(),
});

export const upsertSpecSchema = z.object({
	taskId: z.string().uuid(),
	spec: executionCircuitSpecSchema,
});

export const validateSpecSchema = z.object({
	spec: executionCircuitSpecSchema,
});

export const compileTransitionPromptSchema = z.object({
	taskId: z.string().uuid(),
	transitionId: z.string().min(1),
});

export const createTransitionRunSchema = z.object({
	circuitId: z.string().uuid(),
	transitionId: z.string().min(1),
	input: z.record(z.string(), z.unknown()).optional(),
});

export const transitionRunIdSchema = z.object({
	transitionRunId: z.string().uuid(),
});

export const appendTraceEventSchema = z.object({
	transitionRunId: z.string().uuid(),
	kind: z.enum([
		"state_entered",
		"transition_started",
		"runtime_invoked",
		"output_received",
		"validator_passed",
		"validator_failed",
		"transition_completed",
		"transition_failed",
		"note",
	]),
	payload: z.record(z.string(), z.unknown()).optional(),
});

export const completeTransitionRunSchema = z.object({
	transitionRunId: z.string().uuid(),
	status: z.enum(["completed", "failed", "canceled"]),
	output: z.record(z.string(), z.unknown()).optional(),
	error: z
		.object({
			code: z.string(),
			message: z.string(),
			kind: z.string().optional(),
		})
		.optional(),
});
