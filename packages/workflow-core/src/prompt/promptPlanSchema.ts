import { z } from "zod";

/** Zod schema validating an LLM-produced {@link PromptPlan} before conversion. */
export const promptPlanNodeSchema = z.object({
	id: z.string().min(1),
	type: z.string().min(1),
	label: z.string().optional(),
	sourcePromptCardId: z.string().optional(),
	subBlocks: z.record(z.string(), z.unknown()).optional(),
});

export const promptPlanEdgeSchema = z.object({
	source: z.string().min(1),
	target: z.string().min(1),
	sourceHandle: z.string().optional(),
});

export const promptPlanSchema = z.object({
	nodes: z.array(promptPlanNodeSchema).min(1),
	edges: z.array(promptPlanEdgeSchema),
	metadata: z.object({
		name: z.string().min(1),
		description: z.string().optional(),
	}),
});

export const promptCardSchema = z.object({
	id: z.string().min(1),
	text: z.string().min(1),
});
