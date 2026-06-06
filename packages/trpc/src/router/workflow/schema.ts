import { z } from "zod";

export const workflowBlockSchema = z.object({
	type: z.string(),
	name: z.string().optional(),
	enabled: z.boolean().optional(),
	position: z.object({ x: z.number(), y: z.number() }).optional(),
	subBlocks: z.record(z.string(), z.unknown()).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const workflowEdgeSchema = z.object({
	id: z.string().optional(),
	source: z.string(),
	target: z.string(),
	sourceHandle: z.string().optional(),
	targetHandle: z.string().optional(),
});

export const workflowStateSchema = z.object({
	id: z.string().optional(),
	blocks: z.record(z.string(), workflowBlockSchema),
	edges: z.array(workflowEdgeSchema),
	variables: z
		.record(
			z.string(),
			z.object({
				type: z.enum(["string", "number", "boolean", "json"]),
				value: z.unknown().optional(),
			}),
		)
		.default({}),
	loops: z
		.record(
			z.string(),
			z.object({
				nodes: z.array(z.string()),
				maxIterations: z.number().optional(),
			}),
		)
		.default({}),
	parallels: z
		.record(z.string(), z.object({ nodes: z.array(z.string()) }))
		.default({}),
	metadata: z.object({ name: z.string(), description: z.string().optional() }),
});

export const jsonSchemaSchema = z.record(z.string(), z.unknown());

const slugSchema = z
	.string()
	.min(1)
	.max(80)
	.regex(/^[a-z0-9-]+$/, "Slug must be kebab-case (a-z, 0-9, -)");

export const createWorkflowDraftSchema = z.object({
	name: z.string().min(1).max(120),
	slug: slugSchema,
	description: z.string().max(2000).optional(),
	v2ProjectId: z.string().uuid().optional(),
	draftState: workflowStateSchema.optional(),
});

export const listWorkflowsSchema = z
	.object({ v2ProjectId: z.string().uuid().optional() })
	.optional();

export const workflowIdSchema = z.object({ workflowId: z.string().uuid() });

export const updateWorkflowDraftStateSchema = z.object({
	workflowId: z.string().uuid(),
	draftState: workflowStateSchema,
});

export const validateWorkflowDraftSchema = z.object({
	workflowId: z.string().uuid().optional(),
	draftState: workflowStateSchema.optional(),
});

export const createWorkflowVersionSchema = z.object({
	workflowId: z.string().uuid(),
	changelog: z.string().max(2000).optional(),
});

export const deployWorkflowSchema = z.object({
	workflowId: z.string().uuid(),
	workflowVersionId: z.string().uuid().optional(),
	environment: z.string().min(1).max(40).default("production"),
});
