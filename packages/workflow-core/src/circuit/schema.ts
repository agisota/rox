/**
 * Zod schemas mirroring {@link ./types}. Style follows
 * `src/prompt/promptPlanSchema.ts`. The hand-written interfaces in `types.ts`
 * remain the canonical TS contract; these schemas validate untrusted payloads
 * (tRPC inputs, persisted specs) at the boundary. Cross-compatibility is proven
 * at typecheck time wherever a parsed value is passed to a function typed
 * against `types.ts` (e.g. the executionCircuit router).
 */

import { z } from "zod";
import type { JsonSchema } from "../types";

/** A JSON Schema document. Kept permissive — deep validation lives in `../schema`. */
export const jsonSchemaContractSchema = z.custom<JsonSchema>(
	(val) => typeof val === "object" && val !== null && !Array.isArray(val),
	{ message: "Expected a JSON Schema object" },
);

export const stateSpecSchema = z.object({
	id: z.string().min(1),
	label: z.string().optional(),
	description: z.string().optional(),
	terminal: z.boolean().optional(),
});

export const eventSpecSchema = z.object({
	id: z.string().min(1),
	label: z.string().optional(),
	description: z.string().optional(),
});

export const runtimeBindingSpecSchema = z.object({
	kind: z.string().min(1),
	ref: z.string().optional(),
	config: z.record(z.string(), z.unknown()).optional(),
});

export const outputContractSpecSchema = z.object({
	schema: jsonSchemaContractSchema,
	description: z.string().optional(),
});

export const validatorSpecSchema = z.object({
	id: z.string().min(1),
	kind: z.string().min(1),
	description: z.string().optional(),
	config: z.record(z.string(), z.unknown()).optional(),
});

export const executionMonadSpecSchema = z.object({
	runtimeBinding: runtimeBindingSpecSchema.optional(),
	outputContract: outputContractSpecSchema.optional(),
	validators: z.array(validatorSpecSchema).optional(),
	events: z.array(eventSpecSchema).optional(),
});

export const transitionSpecSchema = z.object({
	id: z.string().min(1),
	from: z.string().min(1),
	to: z.string().min(1),
	label: z.string().optional(),
	description: z.string().optional(),
	event: z.string().optional(),
	monad: executionMonadSpecSchema,
});

export const executionCircuitSpecSchema = z.object({
	id: z.string().optional(),
	name: z.string().min(1),
	description: z.string().optional(),
	initialState: z.string().min(1),
	targetState: z.string().min(1),
	states: z.array(stateSpecSchema).min(1),
	transitions: z.array(transitionSpecSchema),
});

/** Inferred input type for callers that want the zod-derived shape. */
export type ExecutionCircuitSpecInput = z.infer<
	typeof executionCircuitSpecSchema
>;
