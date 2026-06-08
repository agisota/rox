/**
 * Rox Automation Fabric — execution circuit schema (execution-circuit epic).
 *
 * The execution circuit is the first-class state-transition layer for a task:
 *   execution_circuits      → the TargetState + typed transitions for a task (1:1 draft)
 *   transition_runs         → a single execution of one transition
 *   experience_trace_events → ordered trace of what happened inside a run
 *
 * jsonb columns are typed against the `@rox/workflow-core` domain types, exactly
 * like `./workflow.ts` does for `RoxWorkflowState`.
 *
 * NOTE: never hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import type {
	ExecutionCircuitSpec,
	WorkflowRunError,
} from "@rox/workflow-core";
import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { traceEventKindValues, transitionRunStatusValues } from "./enums";
import { tasks } from "./schema";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const transitionRunStatus = pgEnum(
	"transition_run_status",
	transitionRunStatusValues,
);
export const traceEventKind = pgEnum("trace_event_kind", traceEventKindValues);

// ---------------------------------------------------------------------------
// execution_circuits — the TargetState + typed transitions for a task (1:1 draft)
// ---------------------------------------------------------------------------

export const executionCircuits = pgTable(
	"execution_circuits",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		taskId: uuid("task_id")
			.notNull()
			.references(() => tasks.id, { onDelete: "cascade" }),

		spec: jsonb().$type<ExecutionCircuitSpec>().notNull(),
		status: transitionRunStatus().notNull().default("pending"),
		isDraft: integer("is_draft").notNull().default(1),
		version: integer().notNull().default(1),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// 1:1 draft circuit per task.
		uniqueIndex("execution_circuits_task_uniq").on(t.taskId),
		index("execution_circuits_org_idx").on(t.organizationId),
	],
);

export type InsertExecutionCircuit = typeof executionCircuits.$inferInsert;
export type SelectExecutionCircuit = typeof executionCircuits.$inferSelect;

// ---------------------------------------------------------------------------
// transition_runs — a single execution of one circuit transition
// ---------------------------------------------------------------------------

export const transitionRuns = pgTable(
	"transition_runs",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		executionCircuitId: uuid("execution_circuit_id")
			.notNull()
			.references(() => executionCircuits.id, { onDelete: "cascade" }),

		/** Transition id within the circuit spec (not a DB FK — specs are jsonb). */
		transitionId: text("transition_id").notNull(),
		status: transitionRunStatus().notNull().default("pending"),
		compiledPrompt: text("compiled_prompt"),

		input: jsonb().$type<Record<string, unknown>>(),
		output: jsonb().$type<Record<string, unknown>>(),
		error: jsonb().$type<WorkflowRunError>(),

		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("transition_runs_circuit_idx").on(t.executionCircuitId),
		index("transition_runs_org_idx").on(t.organizationId),
		index("transition_runs_status_idx").on(t.status),
	],
);

export type InsertTransitionRun = typeof transitionRuns.$inferInsert;
export type SelectTransitionRun = typeof transitionRuns.$inferSelect;

// ---------------------------------------------------------------------------
// experience_trace_events — ordered trace of what happened inside a run
// ---------------------------------------------------------------------------

export const experienceTraceEvents = pgTable(
	"experience_trace_events",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		transitionRunId: uuid("transition_run_id")
			.notNull()
			.references(() => transitionRuns.id, { onDelete: "cascade" }),

		kind: traceEventKind().notNull(),
		payload: jsonb().$type<Record<string, unknown>>(),
		seq: integer().notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("experience_trace_events_run_seq_idx").on(t.transitionRunId, t.seq),
		index("experience_trace_events_org_idx").on(t.organizationId),
	],
);

export type InsertExperienceTraceEvent =
	typeof experienceTraceEvents.$inferInsert;
export type SelectExperienceTraceEvent =
	typeof experienceTraceEvents.$inferSelect;
