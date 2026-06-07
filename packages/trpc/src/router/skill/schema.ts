import { objectTypeValues } from "@rox/db/enums";
import { z } from "zod";
import { jsonSchemaSchema } from "../workflow/schema";

const objectTypeSchema = z.enum(objectTypeValues);

const slugSchema = z
	.string()
	.min(1)
	.max(80)
	.regex(/^[a-z0-9-]+$/, "Slug must be kebab-case (a-z, 0-9, -)");
const runModesSchema = z.array(z.string()).default([]);
const visibilitySchema = z
	.enum(["private", "project", "organization", "public"])
	.default("private");
const surfaceSchema = z.enum([
	"object_action",
	"command_palette",
	"workflow_node",
	"agent_tool",
	"api",
	"mcp",
]);

/** The mutually-exclusive implementation refs (exactly one required). */
export const implementationRefSchema = z.object({
	workflowDeploymentId: z.string().uuid().optional(),
	legacyAutomationId: z.string().uuid().optional(),
	simWorkflowExternalId: z.string().optional(),
	externalToolRef: z.record(z.string(), z.unknown()).optional(),
});

export const publishWorkflowSchema = z.object({
	workflowId: z.string().uuid(),
	name: z.string().min(1).max(120),
	slug: slugSchema,
	description: z.string().max(2000).optional(),
	inputSchema: jsonSchemaSchema,
	outputSchema: jsonSchemaSchema,
	runModes: runModesSchema,
	visibility: visibilitySchema,
});

export const createInstructionSkillSchema = z.object({
	name: z.string().min(1).max(120),
	slug: slugSchema,
	description: z.string().max(2000).optional(),
	documentationMd: z.string().min(1),
	visibility: visibilitySchema,
	v2ProjectId: z.string().uuid().optional(),
});

export const createSkillVersionSchema = implementationRefSchema.extend({
	skillId: z.string().uuid(),
	inputSchema: jsonSchemaSchema,
	outputSchema: jsonSchemaSchema,
	runModes: runModesSchema,
	documentationMd: z.string().optional(),
});

export const skillIdSchema = z.object({ skillId: z.string().uuid() });

export const promoteVersionSchema = z.object({
	skillId: z.string().uuid(),
	skillVersionId: z.string().uuid(),
});

export const listSkillsSchema = z
	.object({ v2ProjectId: z.string().uuid().optional() })
	.optional();

export const bindSkillSchema = z.object({
	skillId: z.string().uuid(),
	surface: surfaceSchema,
	objectType: objectTypeSchema.optional(),
	placement: z.string().optional(),
	label: z.string().optional(),
	config: z.record(z.string(), z.unknown()).optional(),
});

export const unbindSchema = z.object({ bindingId: z.string().uuid() });

export const listBindingsSchema = z.object({
	skillId: z.string().uuid().optional(),
	surface: surfaceSchema.optional(),
	objectType: objectTypeSchema.optional(),
});

export const validateRunInputSchema = z.object({
	skillId: z.string().uuid(),
	input: z.record(z.string(), z.unknown()),
});

export const runSkillSchema = z.object({
	skillId: z.string().uuid(),
	input: z.record(z.string(), z.unknown()).default({}),
	runMode: z.string().default("manual"),
});

export const listSkillRunsSchema = z.object({
	skillId: z.string().uuid(),
	limit: z.number().int().min(1).max(200).default(50),
});
