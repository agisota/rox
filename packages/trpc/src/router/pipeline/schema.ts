import { triggerKindValues } from "@rox/db/enums";
import { PIPELINE_TRIGGER_EVENT_KINDS } from "@rox/workflow-core";
import { z } from "zod";
import { workflowStateSchema } from "../workflow/schema";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const slugSchema = z
	.string()
	.min(1)
	.max(80)
	.regex(/^[a-z0-9-]+$/, "Slug must be kebab-case (a-z, 0-9, -)");

/**
 * Trigger kinds that can bind to a pipeline node via the registry. This is the
 * full `trigger_kind` pgEnum; the dispatcher maps the cross-run subset to
 * {@link PipelineTriggerEventKind} (see `@rox/workflow-core`).
 */
const triggerKindSchema = z.enum(triggerKindValues);

/**
 * The five cross-run pipeline event kinds (the sixth product trigger,
 * `all_prior_agents_finished`, is a native graph JOIN and has no event kind).
 */
export const pipelineEventKindSchema = z.enum(
	PIPELINE_TRIGGER_EVENT_KINDS as unknown as [string, ...string[]],
);

/** Match predicate persisted on `pipeline_triggers.matchConfig`. */
export const triggerMatchConfigSchema = z
	.object({
		chatSessionId: z.string().optional(),
		afterNodeIds: z.array(z.string()).optional(),
		afterRoleSlugs: z.array(z.string()).optional(),
		pathGlob: z.string().optional(),
		artifactKind: z.string().optional(),
		skillSlug: z.string().optional(),
		integrationId: z.string().optional(),
	})
	.default({});

// ---------------------------------------------------------------------------
// pipeline router inputs (CRUD on workflow_definitions with engine="pipeline")
// ---------------------------------------------------------------------------

export const pipelineIdSchema = z.object({ pipelineId: z.string().uuid() });

export const listPipelinesSchema = z
	.object({ v2ProjectId: z.string().uuid().optional() })
	.optional();

export const createPipelineSchema = z.object({
	name: z.string().min(1).max(120),
	slug: slugSchema,
	description: z.string().max(2000).optional(),
	v2ProjectId: z.string().uuid().optional(),
	draftState: workflowStateSchema.optional(),
});

export const updatePipelineGraphSchema = z.object({
	pipelineId: z.string().uuid(),
	draftState: workflowStateSchema,
});

export const validatePipelineSchema = z.object({
	pipelineId: z.string().uuid().optional(),
	draftState: workflowStateSchema.optional(),
});

export const runPipelineSchema = z.object({
	pipelineId: z.string().uuid(),
	/** Originating message seeding the run's accumulating context (design §5). */
	seedMessage: z.string().min(1).max(100_000),
	/** Optional structured input handed to the entry node. */
	input: z.record(z.string(), z.unknown()).default({}),
});

export const listPipelineRunsSchema = z.object({
	pipelineId: z.string().uuid(),
	limit: z.number().int().min(1).max(200).default(50),
});

/**
 * Host → main relay input for `pipeline.ingestEvent` (design §4.3 "emit seams").
 *
 * The desktop host (local SQLite) cannot reach the Neon-backed dispatcher, so it
 * relays the REAL host-originating events here via its authenticated api client.
 * The org is resolved server-side from the caller's active membership (never
 * trusted from the host); the project is resolved from the referenced chat
 * session / supplied directly. A discriminated union keeps each kind's payload
 * minimal and validated.
 */
export const ingestEventSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("user_sent_message"),
		/** The chat session the message was sent in (resolves project scope). */
		chatSessionId: z.string().uuid(),
		/** The submitted message text (seeds the dispatched run's context). */
		message: z.string().min(1).max(100_000),
	}),
	z.object({
		kind: z.literal("agent_run_finished"),
		/** The finished CLI/terminal agent's host session reference. */
		agentRunRef: z.object({
			kind: z.enum(["terminal", "chat"]),
			sessionId: z.string().min(1),
			roleSlug: z.string().min(1).optional(),
			nodeId: z.string().min(1).optional(),
		}),
		/**
		 * Project scope for the run. Optional: when omitted the event is org-wide
		 * (matches only unscoped triggers). The host supplies this when it knows the
		 * workspace's project; the main API does not re-resolve it from a terminal
		 * session (terminals aren't persisted in the Neon chat tables).
		 */
		v2ProjectId: z.string().uuid().optional(),
	}),
]);

export const getPipelineRunSchema = z.object({
	pipelineId: z.string().uuid(),
	runId: z.string().uuid(),
});

/**
 * Replay a saved pipeline run (issue #553). Whole-run replay re-fires the source
 * run's persisted `input` as a fresh run; provenance (`parentRunId` + a
 * `replay`-marked `triggerRef`) links it back to the source. The optional
 * `fromStepBlockId` switches to a re-run-from-step: the executor enters at that
 * node (existing `entryNodeId` seam) seeded from the recorded step's `input`.
 */
export const replayPipelineRunSchema = z.object({
	pipelineId: z.string().uuid(),
	/** The source run whose persisted `input`/steps seed the replay. */
	runId: z.string().uuid(),
	/**
	 * When set, re-run from this node instead of the whole graph. The node's
	 * recorded step `input` (the payload it received) seeds the new run, and the
	 * executor enters at this block via `entryNodeId`.
	 */
	fromStepBlockId: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// agentRole router inputs (CRUD on skills(kind="agent") + agentConfig preset)
// ---------------------------------------------------------------------------

const agentRoleKindSchema = z.enum(["chat", "terminal"]);

export const agentRoleSettingsSchema = z
	.object({
		maxTurns: z.number().int().min(1).max(200).optional(),
		temperature: z.number().min(0).max(2).optional(),
		mcpScope: z.array(z.string()).optional(),
		worktreeBranchPrefix: z.string().max(60).optional(),
	})
	.default({});

export const agentRolePresetSchema = z.object({
	agentKind: agentRoleKindSchema,
	agentId: z.string().min(1).max(200),
	model: z.string().max(200).optional(),
	systemPrompt: z.string().min(1).max(100_000),
	skillSlugs: z.array(slugSchema).default([]),
	settings: agentRoleSettingsSchema,
});

export const listAgentRolesSchema = z
	.object({ v2ProjectId: z.string().uuid().optional() })
	.optional();

export const agentRoleIdSchema = z.object({ roleSkillId: z.string().uuid() });

export const createAgentRoleSchema = z.object({
	name: z.string().min(1).max(120),
	slug: slugSchema,
	description: z.string().max(2000).optional(),
	v2ProjectId: z.string().uuid().optional(),
	preset: agentRolePresetSchema,
});

export const updateAgentRoleSchema = z.object({
	roleSkillId: z.string().uuid(),
	name: z.string().min(1).max(120).optional(),
	description: z.string().max(2000).optional(),
	/** Publishes a new version carrying the updated preset bundle. */
	preset: agentRolePresetSchema.optional(),
});

export const seedBuiltinRolesSchema = z
	.object({ v2ProjectId: z.string().uuid().optional() })
	.optional();

// ---------------------------------------------------------------------------
// trigger router inputs (CRUD on pipeline_triggers)
// ---------------------------------------------------------------------------

export const triggerIdSchema = z.object({ triggerId: z.string().uuid() });

export const listTriggersSchema = z
	.object({
		v2ProjectId: z.string().uuid().optional(),
		pipelineId: z.string().uuid().optional(),
		triggerKind: triggerKindSchema.optional(),
		enabled: z.boolean().optional(),
	})
	.optional();

export const createTriggerSchema = z.object({
	pipelineId: z.string().uuid(),
	nodeId: z.string().min(1),
	triggerKind: triggerKindSchema,
	v2ProjectId: z.string().uuid().optional(),
	matchConfig: triggerMatchConfigSchema,
	enabled: z.boolean().default(true),
});

export const updateTriggerSchema = z.object({
	triggerId: z.string().uuid(),
	nodeId: z.string().min(1).optional(),
	triggerKind: triggerKindSchema.optional(),
	matchConfig: triggerMatchConfigSchema.optional(),
	enabled: z.boolean().optional(),
});

export const setTriggerEnabledSchema = z.object({
	triggerId: z.string().uuid(),
	enabled: z.boolean(),
});

export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;
export type CreateAgentRoleInput = z.infer<typeof createAgentRoleSchema>;
export type CreateTriggerInput = z.infer<typeof createTriggerSchema>;
