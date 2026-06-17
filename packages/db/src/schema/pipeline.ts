/**
 * Agent Pipelines — trigger registry schema.
 *
 * A "pipeline" is a project-scoped `workflow_definitions` row with
 * `engine="pipeline"` whose graph nodes are mostly `agent_run` blocks. Pipeline
 * runs reuse `workflow_runs` / `workflow_run_steps` verbatim; pipeline roles
 * reuse `skills(kind="agent")` + `skill_versions.agentConfig`.
 *
 * The ONE genuinely new persistence object is `pipeline_triggers`: the registry
 * mapping an event class to a pipeline graph node. The cross-run dispatcher
 * (in `@rox/trpc`) reads this table and fires the matching node as a run.
 *
 * NOTE: never hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import type { TriggerMatchConfig } from "@rox/workflow-core";
import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { v2Projects } from "./schema";
// Reuse the existing `trigger_kind` pgEnum (defined in ./workflow) rather than
// redefining it — a second pgEnum with the same name would conflict at migration
// time.
import { triggerKind, workflowDefinitions } from "./workflow";

// ---------------------------------------------------------------------------
// pipeline_triggers — event → pipeline node registry
// ---------------------------------------------------------------------------

export const pipelineTriggers = pgTable(
	"pipeline_triggers",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "cascade",
		}),
		/** The pipeline (`workflow_definitions` row with engine="pipeline"). */
		workflowId: uuid("workflow_id")
			.notNull()
			.references(() => workflowDefinitions.id, { onDelete: "cascade" }),
		/** The RoxBlockState id within the pipeline graph this trigger fires. */
		nodeId: text("node_id").notNull(),
		/** Which event class fires this node (reuses the shared trigger_kind enum). */
		triggerKind: triggerKind("trigger_kind").notNull(),
		/** Event-specific match predicate (chat session, glob, skill slug, …). */
		matchConfig: jsonb("match_config")
			.$type<TriggerMatchConfig>()
			.notNull()
			.default({}),
		enabled: boolean().notNull().default(true),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// Dispatcher hot path: SELECT … WHERE trigger_kind = ? AND enabled.
		index("pipeline_triggers_match_idx").on(t.triggerKind, t.enabled),
		index("pipeline_triggers_project_idx").on(t.v2ProjectId),
		index("pipeline_triggers_workflow_idx").on(t.workflowId),
		index("pipeline_triggers_org_idx").on(t.organizationId),
	],
);

export type InsertPipelineTrigger = typeof pipelineTriggers.$inferInsert;
export type SelectPipelineTrigger = typeof pipelineTriggers.$inferSelect;
