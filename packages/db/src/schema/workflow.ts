/**
 * Superset Automation Fabric — workflow / skill / run schema.
 *
 * This is the NEW graph-based workflow + skill layer. It lives alongside the
 * legacy scheduled `automations` tables in `./schema.ts` and does not replace
 * them — a legacy automation can later be wrapped as a skill via
 * `skill_versions.legacy_automation_id`.
 *
 * Canonical entities:
 *   workflow_definitions → workflow_versions (immutable) → workflow_deployments
 *   skills → skill_versions (point at a deployment / legacy automation / sim / tool)
 *   skill_bindings (controlled exposure: object action / command / node / api / mcp / agent)
 *   workflow_runs → workflow_run_steps (canonical execution records)
 *   context_packs, artifacts, object_relations (reproducibility + object graph)
 *   approval_requests (human-in-the-loop gating)
 *
 * NOTE: never hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import type {
	JsonSchema,
	ObjectRef,
	RunCost,
	SupersetWorkflowState,
	WorkflowRunError,
	WorkflowValidationResult,
} from "@superset/workflow-core";
import { sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	real,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import {
	approvalStatusValues,
	artifactKindValues,
	evaluationStatusValues,
	objectTypeValues,
	skillBindingSurfaceValues,
	skillKindValues,
	skillStatusValues,
	skillVisibilityValues,
	triggerKindValues,
	workflowDeploymentStatusValues,
	workflowEngineValues,
	workflowRunStatusValues,
	workflowStatusValues,
	workflowStepStatusValues,
} from "./enums";
import { automations, v2Projects } from "./schema";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const workflowEngine = pgEnum("workflow_engine", workflowEngineValues);
export const workflowStatus = pgEnum("workflow_status", workflowStatusValues);
export const workflowDeploymentStatus = pgEnum(
	"workflow_deployment_status",
	workflowDeploymentStatusValues,
);
export const skillKind = pgEnum("skill_kind", skillKindValues);
export const skillStatus = pgEnum("skill_status", skillStatusValues);
export const skillVisibility = pgEnum(
	"skill_visibility",
	skillVisibilityValues,
);
export const skillBindingSurface = pgEnum(
	"skill_binding_surface",
	skillBindingSurfaceValues,
);
export const workflowRunStatus = pgEnum(
	"workflow_run_status",
	workflowRunStatusValues,
);
export const workflowStepStatus = pgEnum(
	"workflow_step_status",
	workflowStepStatusValues,
);
export const triggerKind = pgEnum("trigger_kind", triggerKindValues);
export const objectType = pgEnum("object_type", objectTypeValues);
export const approvalStatus = pgEnum("approval_status", approvalStatusValues);
export const artifactKind = pgEnum("artifact_kind", artifactKindValues);

// Shapes for jsonb payloads that don't yet have a dedicated domain type. Kept
// loose now; tightened as the runtime/skill layers land in later milestones.
type SkillExample = Record<string, unknown>;
type SkillRunMode = string;
type ContextRequirement = Record<string, unknown>;
type ConnectionRequirement = Record<string, unknown>;
type SecretRequirement = Record<string, unknown>;
type SkillPolicy = Record<string, unknown>;

// ---------------------------------------------------------------------------
// workflow_definitions — draft identity of a workflow
// ---------------------------------------------------------------------------

export const workflowDefinitions = pgTable(
	"workflow_definitions",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "cascade",
		}),
		ownerUserId: uuid("owner_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		name: text().notNull(),
		slug: text().notNull(),
		description: text(),

		engine: workflowEngine().notNull().default("superset"),
		draftState: jsonb("draft_state").$type<SupersetWorkflowState>().notNull(),
		status: workflowStatus().notNull().default("draft"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("workflow_definitions_org_project_slug_uniq").on(
			t.organizationId,
			t.v2ProjectId,
			t.slug,
		),
		index("workflow_definitions_org_idx").on(t.organizationId),
		index("workflow_definitions_project_idx").on(t.v2ProjectId),
		index("workflow_definitions_owner_idx").on(t.ownerUserId),
	],
);

export type InsertWorkflowDefinition = typeof workflowDefinitions.$inferInsert;
export type SelectWorkflowDefinition = typeof workflowDefinitions.$inferSelect;

// ---------------------------------------------------------------------------
// workflow_versions — immutable snapshot of a workflow graph
// ---------------------------------------------------------------------------

export const workflowVersions = pgTable(
	"workflow_versions",
	{
		id: uuid().primaryKey().defaultRandom(),
		workflowId: uuid("workflow_id")
			.notNull()
			.references(() => workflowDefinitions.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		versionNumber: integer("version_number").notNull(),
		stateSnapshot: jsonb("state_snapshot")
			.$type<SupersetWorkflowState>()
			.notNull(),
		validationSnapshot: jsonb(
			"validation_snapshot",
		).$type<WorkflowValidationResult>(),
		changelog: text(),

		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("workflow_versions_workflow_number_uniq").on(
			t.workflowId,
			t.versionNumber,
		),
		index("workflow_versions_workflow_idx").on(t.workflowId),
		index("workflow_versions_org_idx").on(t.organizationId),
	],
);

export type InsertWorkflowVersion = typeof workflowVersions.$inferInsert;
export type SelectWorkflowVersion = typeof workflowVersions.$inferSelect;

// ---------------------------------------------------------------------------
// workflow_deployments — the runnable version in an environment
// ---------------------------------------------------------------------------

export const workflowDeployments = pgTable(
	"workflow_deployments",
	{
		id: uuid().primaryKey().defaultRandom(),
		workflowId: uuid("workflow_id")
			.notNull()
			.references(() => workflowDefinitions.id, { onDelete: "cascade" }),
		workflowVersionId: uuid("workflow_version_id")
			.notNull()
			.references(() => workflowVersions.id, { onDelete: "restrict" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		environment: text().notNull().default("production"),
		status: workflowDeploymentStatus().notNull().default("active"),

		deployedByUserId: uuid("deployed_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		deployedAt: timestamp("deployed_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("workflow_deployments_workflow_idx").on(t.workflowId),
		index("workflow_deployments_org_idx").on(t.organizationId),
		uniqueIndex("workflow_deployments_active_env_uniq")
			.on(t.workflowId, t.environment)
			.where(sql`${t.status} = 'active'`),
	],
);

export type InsertWorkflowDeployment = typeof workflowDeployments.$inferInsert;
export type SelectWorkflowDeployment = typeof workflowDeployments.$inferSelect;

// ---------------------------------------------------------------------------
// skills — product-level reusable capability
// ---------------------------------------------------------------------------

export const skills = pgTable(
	"skills",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "cascade",
		}),
		ownerUserId: uuid("owner_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		slug: text().notNull(),
		name: text().notNull(),
		description: text(),
		kind: skillKind().notNull(),
		status: skillStatus().notNull().default("draft"),
		visibility: skillVisibility().notNull().default("private"),

		// Soft pointer to the active skill_versions row. Intentionally NOT a
		// DB-level FK: a mutual skills<->skill_versions reference makes drizzle's
		// table types circular. Integrity is enforced at the service layer.
		currentVersionId: uuid("current_version_id"),

		icon: text(),
		category: text(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("skills_org_project_slug_uniq").on(
			t.organizationId,
			t.v2ProjectId,
			t.slug,
		),
		index("skills_org_idx").on(t.organizationId),
		index("skills_project_idx").on(t.v2ProjectId),
		index("skills_kind_idx").on(t.kind),
	],
);

export type InsertSkill = typeof skills.$inferInsert;
export type SelectSkill = typeof skills.$inferSelect;

// ---------------------------------------------------------------------------
// skill_versions — typed, immutable executable contract
//
// Exactly one implementation ref should be set (enforced at the service layer,
// see DB-06): workflow_deployment_id | legacy_automation_id |
// sim_workflow_external_id | external_tool_ref.
// ---------------------------------------------------------------------------

export const skillVersions = pgTable(
	"skill_versions",
	{
		id: uuid().primaryKey().defaultRandom(),
		skillId: uuid("skill_id")
			.notNull()
			.references(() => skills.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		versionNumber: integer("version_number").notNull(),
		inputSchema: jsonb("input_schema").$type<JsonSchema>().notNull(),
		outputSchema: jsonb("output_schema").$type<JsonSchema>().notNull(),

		// Implementation refs (mutually exclusive at the service layer).
		workflowDeploymentId: uuid("workflow_deployment_id").references(
			() => workflowDeployments.id,
			{ onDelete: "restrict" },
		),
		legacyAutomationId: uuid("legacy_automation_id").references(
			() => automations.id,
			{ onDelete: "set null" },
		),
		simWorkflowExternalId: text("sim_workflow_external_id"),
		externalToolRef:
			jsonb("external_tool_ref").$type<Record<string, unknown>>(),

		documentationMd: text("documentation_md"),
		examples: jsonb().$type<SkillExample[]>(),
		runModes: jsonb("run_modes").$type<SkillRunMode[]>().notNull().default([]),
		requiredContext: jsonb("required_context")
			.$type<ContextRequirement[]>()
			.notNull()
			.default([]),
		requiredConnections: jsonb("required_connections")
			.$type<ConnectionRequirement[]>()
			.notNull()
			.default([]),
		requiredSecrets: jsonb("required_secrets")
			.$type<SecretRequirement[]>()
			.notNull()
			.default([]),
		policy: jsonb().$type<SkillPolicy>().notNull().default({}),

		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("skill_versions_skill_number_uniq").on(
			t.skillId,
			t.versionNumber,
		),
		index("skill_versions_skill_idx").on(t.skillId),
		index("skill_versions_org_idx").on(t.organizationId),
		index("skill_versions_deployment_idx").on(t.workflowDeploymentId),
		index("skill_versions_legacy_automation_idx").on(t.legacyAutomationId),
	],
);

export type InsertSkillVersion = typeof skillVersions.$inferInsert;
export type SelectSkillVersion = typeof skillVersions.$inferSelect;

// ---------------------------------------------------------------------------
// skill_bindings — controlled exposure surfaces
// ---------------------------------------------------------------------------

export const skillBindings = pgTable(
	"skill_bindings",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		skillId: uuid("skill_id")
			.notNull()
			.references(() => skills.id, { onDelete: "cascade" }),

		surface: skillBindingSurface().notNull(),
		objectType: objectType("object_type"),
		placement: text(),
		label: text(),
		enabled: boolean().notNull().default(true),
		config: jsonb().$type<Record<string, unknown>>(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("skill_bindings_skill_idx").on(t.skillId),
		index("skill_bindings_surface_idx").on(t.surface, t.objectType, t.enabled),
		index("skill_bindings_org_idx").on(t.organizationId),
	],
);

export type InsertSkillBinding = typeof skillBindings.$inferInsert;
export type SelectSkillBinding = typeof skillBindings.$inferSelect;

// ---------------------------------------------------------------------------
// context_packs — reproducibility snapshot for a run
// ---------------------------------------------------------------------------

export const contextPacks = pgTable(
	"context_packs",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "set null",
		}),

		includedObjectRefs: jsonb("included_object_refs")
			.$type<ObjectRef[]>()
			.notNull()
			.default([]),
		retrievalConfig: jsonb("retrieval_config").$type<Record<string, unknown>>(),
		redactionPolicy: jsonb("redaction_policy").$type<Record<string, unknown>>(),
		tokenBudget: integer("token_budget"),
		snapshot: jsonb().$type<Record<string, unknown>>(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("context_packs_org_idx").on(t.organizationId)],
);

export type InsertContextPack = typeof contextPacks.$inferInsert;
export type SelectContextPack = typeof contextPacks.$inferSelect;

// ---------------------------------------------------------------------------
// workflow_runs — canonical execution record (new system; NOT automation_runs)
// ---------------------------------------------------------------------------

export const workflowRuns = pgTable(
	"workflow_runs",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "set null",
		}),

		workflowId: uuid("workflow_id").references(() => workflowDefinitions.id, {
			onDelete: "set null",
		}),
		workflowVersionId: uuid("workflow_version_id").references(
			() => workflowVersions.id,
			{ onDelete: "set null" },
		),
		skillId: uuid("skill_id").references(() => skills.id, {
			onDelete: "set null",
		}),
		skillVersionId: uuid("skill_version_id").references(
			() => skillVersions.id,
			{ onDelete: "set null" },
		),
		// Self-reference: parent run for nested skill calls (FK in table extras).
		parentRunId: uuid("parent_run_id"),

		triggerKind: triggerKind("trigger_kind").notNull(),
		triggerRef: jsonb("trigger_ref").$type<Record<string, unknown>>(),
		status: workflowRunStatus().notNull().default("queued"),

		input: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		output: jsonb().$type<Record<string, unknown>>(),
		error: jsonb().$type<WorkflowRunError>(),

		contextPackId: uuid("context_pack_id").references(() => contextPacks.id, {
			onDelete: "set null",
		}),
		cost: jsonb().$type<RunCost>(),

		startedAt: timestamp("started_at", { withTimezone: true }),
		endedAt: timestamp("ended_at", { withTimezone: true }),

		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("workflow_runs_org_idx").on(t.organizationId),
		index("workflow_runs_project_idx").on(t.v2ProjectId),
		index("workflow_runs_workflow_idx").on(t.workflowId),
		index("workflow_runs_skill_idx").on(t.skillId),
		index("workflow_runs_status_idx").on(t.status),
		index("workflow_runs_parent_idx").on(t.parentRunId),
		foreignKey({
			columns: [t.parentRunId],
			foreignColumns: [t.id],
			name: "workflow_runs_parent_run_id_fk",
		}).onDelete("cascade"),
	],
);

export type InsertWorkflowRun = typeof workflowRuns.$inferInsert;
export type SelectWorkflowRun = typeof workflowRuns.$inferSelect;

// ---------------------------------------------------------------------------
// workflow_run_steps — block-level execution trace
// ---------------------------------------------------------------------------

export const workflowRunSteps = pgTable(
	"workflow_run_steps",
	{
		id: uuid().primaryKey().defaultRandom(),
		runId: uuid("run_id")
			.notNull()
			.references(() => workflowRuns.id, { onDelete: "cascade" }),
		// Self-reference: parent step for nested blocks (FK in table extras).
		parentStepId: uuid("parent_step_id"),

		blockId: text("block_id").notNull(),
		blockType: text("block_type").notNull(),
		blockName: text("block_name"),
		status: workflowStepStatus().notNull().default("pending"),

		input: jsonb().$type<Record<string, unknown>>(),
		output: jsonb().$type<Record<string, unknown>>(),
		error: jsonb().$type<WorkflowRunError>(),

		startedAt: timestamp("started_at", { withTimezone: true }),
		endedAt: timestamp("ended_at", { withTimezone: true }),
		durationMs: integer("duration_ms"),
		cost: jsonb().$type<RunCost>(),
	},
	(t) => [
		index("workflow_run_steps_run_idx").on(t.runId),
		index("workflow_run_steps_parent_idx").on(t.parentStepId),
		foreignKey({
			columns: [t.parentStepId],
			foreignColumns: [t.id],
			name: "workflow_run_steps_parent_step_id_fk",
		}).onDelete("cascade"),
	],
);

export type InsertWorkflowRunStep = typeof workflowRunSteps.$inferInsert;
export type SelectWorkflowRunStep = typeof workflowRunSteps.$inferSelect;

// ---------------------------------------------------------------------------
// artifacts — structured outputs produced by a run
// ---------------------------------------------------------------------------

export const artifacts = pgTable(
	"artifacts",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "set null",
		}),
		runId: uuid("run_id").references(() => workflowRuns.id, {
			onDelete: "set null",
		}),

		kind: artifactKind().notNull(),
		title: text(),
		body: jsonb().$type<Record<string, unknown>>(),
		markdown: text(),
		blobPathname: text("blob_pathname"),
		mediaType: text("media_type"),

		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("artifacts_org_idx").on(t.organizationId),
		index("artifacts_project_idx").on(t.v2ProjectId),
		index("artifacts_run_idx").on(t.runId),
	],
);

export type InsertArtifact = typeof artifacts.$inferInsert;
export type SelectArtifact = typeof artifacts.$inferSelect;

// ---------------------------------------------------------------------------
// object_relations — the Superset object graph (typed edges between objects)
//
// Object ids are stored as text because they reference many different tables.
// ---------------------------------------------------------------------------

export const objectRelations = pgTable(
	"object_relations",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		sourceType: objectType("source_type").notNull(),
		sourceId: text("source_id").notNull(),
		relationType: text("relation_type").notNull(),
		targetType: objectType("target_type").notNull(),
		targetId: text("target_id").notNull(),
		metadata: jsonb().$type<Record<string, unknown>>(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("object_relations_source_idx").on(t.sourceType, t.sourceId),
		index("object_relations_target_idx").on(t.targetType, t.targetId),
		index("object_relations_org_idx").on(t.organizationId),
		uniqueIndex("object_relations_edge_uniq").on(
			t.sourceType,
			t.sourceId,
			t.relationType,
			t.targetType,
			t.targetId,
		),
	],
);

export type InsertObjectRelation = typeof objectRelations.$inferInsert;
export type SelectObjectRelation = typeof objectRelations.$inferSelect;

// ---------------------------------------------------------------------------
// approval_requests — human-in-the-loop gate for a run / step
// ---------------------------------------------------------------------------

export const approvalRequests = pgTable(
	"approval_requests",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		runId: uuid("run_id").references(() => workflowRuns.id, {
			onDelete: "cascade",
		}),
		stepId: uuid("step_id").references(() => workflowRunSteps.id, {
			onDelete: "cascade",
		}),

		status: approvalStatus().notNull().default("pending"),
		title: text(),
		payload: jsonb().$type<Record<string, unknown>>(),
		reason: text(),

		requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
		expiresAt: timestamp("expires_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("approval_requests_org_idx").on(t.organizationId),
		index("approval_requests_run_idx").on(t.runId),
		index("approval_requests_status_idx").on(t.status),
	],
);

export type InsertApprovalRequest = typeof approvalRequests.$inferInsert;
export type SelectApprovalRequest = typeof approvalRequests.$inferSelect;

// ---------------------------------------------------------------------------
// Evaluations (M9) — gate skill promotion on golden-output + schema checks
// ---------------------------------------------------------------------------

export const evaluationStatus = pgEnum(
	"evaluation_status",
	evaluationStatusValues,
);

export const evaluationSuites = pgTable(
	"evaluation_suites",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		skillId: uuid("skill_id")
			.notNull()
			.references(() => skills.id, { onDelete: "cascade" }),
		name: text().notNull(),
		description: text(),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("evaluation_suites_skill_idx").on(t.skillId)],
);

export type InsertEvaluationSuite = typeof evaluationSuites.$inferInsert;
export type SelectEvaluationSuite = typeof evaluationSuites.$inferSelect;

export const evaluationCases = pgTable(
	"evaluation_cases",
	{
		id: uuid().primaryKey().defaultRandom(),
		suiteId: uuid("suite_id")
			.notNull()
			.references(() => evaluationSuites.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		name: text(),
		input: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		expectedOutput: jsonb("expected_output").$type<Record<string, unknown>>(),
		outputSchema: jsonb("output_schema").$type<JsonSchema>(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("evaluation_cases_suite_idx").on(t.suiteId)],
);

export type InsertEvaluationCase = typeof evaluationCases.$inferInsert;
export type SelectEvaluationCase = typeof evaluationCases.$inferSelect;

export const evaluationRuns = pgTable(
	"evaluation_runs",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		suiteId: uuid("suite_id")
			.notNull()
			.references(() => evaluationSuites.id, { onDelete: "cascade" }),
		skillVersionId: uuid("skill_version_id").references(
			() => skillVersions.id,
			{ onDelete: "set null" },
		),
		status: evaluationStatus().notNull().default("pending"),
		passRate: real("pass_rate"),
		totalCases: integer("total_cases"),
		passedCases: integer("passed_cases"),
		startedAt: timestamp("started_at", { withTimezone: true }),
		endedAt: timestamp("ended_at", { withTimezone: true }),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("evaluation_runs_suite_idx").on(t.suiteId),
		index("evaluation_runs_version_idx").on(t.skillVersionId),
	],
);

export type InsertEvaluationRun = typeof evaluationRuns.$inferInsert;
export type SelectEvaluationRun = typeof evaluationRuns.$inferSelect;

export const evaluationResults = pgTable(
	"evaluation_results",
	{
		id: uuid().primaryKey().defaultRandom(),
		runId: uuid("run_id")
			.notNull()
			.references(() => evaluationRuns.id, { onDelete: "cascade" }),
		caseId: uuid("case_id")
			.notNull()
			.references(() => evaluationCases.id, { onDelete: "cascade" }),
		status: evaluationStatus().notNull(),
		actualOutput: jsonb("actual_output").$type<Record<string, unknown>>(),
		failures: jsonb().$type<{ path: string; message: string }[]>(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("evaluation_results_run_idx").on(t.runId)],
);

export type InsertEvaluationResult = typeof evaluationResults.$inferInsert;
export type SelectEvaluationResult = typeof evaluationResults.$inferSelect;
