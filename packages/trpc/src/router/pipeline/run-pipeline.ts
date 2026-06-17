import { db } from "@rox/db/client";
import {
	objectRelations,
	type SelectWorkflowDefinition,
	workflowRunSteps,
	workflowRuns,
} from "@rox/db/schema";
import type { AccumulatedContext } from "@rox/workflow-core";
import {
	type RunRecorder,
	type RunStatus,
	type StepRecord,
	WorkflowExecutor,
} from "@rox/workflow-runtime";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { env } from "../../env";
import type { RunSkillTriggerKind } from "../skill/run-service";
import { emitAgentRunFinished } from "./agent-run-events";
import { makeAgentRunResolver } from "./agent-run-service";

export interface RunPipelineArgs {
	organizationId: string;
	userId: string;
	/** The pipeline definition (`workflow_definitions` with engine="pipeline"). */
	pipeline: SelectWorkflowDefinition;
	triggerKind: RunSkillTriggerKind;
	/** Event-specific provenance persisted to `workflow_runs.triggerRef`. */
	triggerRef?: Record<string, unknown>;
	/** Structured input handed to the entry node. */
	input: Record<string, unknown>;
	/** Seed message + transcript threaded into every agent_run node (design §5). */
	initialContext: AccumulatedContext;
}

export interface RunPipelineResult {
	runId: string;
	status: RunStatus;
	output?: Record<string, unknown>;
	error?: { code: string; message: string };
	approvalBlockId?: string;
}

/** Persists each executor step to workflow_run_steps (payloads already redacted). */
class DbRunRecorder implements RunRecorder {
	constructor(private readonly runId: string) {}
	async recordStep(step: StepRecord): Promise<void> {
		await db.insert(workflowRunSteps).values({
			runId: this.runId,
			blockId: step.blockId,
			blockType: step.blockType,
			blockName: step.blockName ?? null,
			status: step.status,
			input: step.input ?? null,
			output: step.output ?? null,
			error: step.error ?? null,
			cost: step.cost ?? null,
		});
	}
}

/**
 * Execute a pipeline run: create a `workflow_runs` row (scoped to the pipeline
 * via `workflowId`), run the pipeline's DRAFT graph via the WorkflowExecutor —
 * threading the accumulating context and injecting the `agent_run` resolver
 * (chat in-proc | CLI via relay) — gate on human approval, then persist the
 * terminal state plus the final accumulating transcript and link the run into
 * the object graph.
 *
 * Unlike `runSkill`, a pipeline runs its draft graph directly (a pipeline is a
 * `workflow_definitions` row, not a published skill deployment). The executor,
 * recorder, approval gating, and accumulating-context contract are shared.
 */
export async function runPipeline(
	args: RunPipelineArgs,
): Promise<RunPipelineResult> {
	const state = args.pipeline.draftState;

	const [run] = await db
		.insert(workflowRuns)
		.values({
			organizationId: args.organizationId,
			v2ProjectId: args.pipeline.v2ProjectId,
			workflowId: args.pipeline.id,
			triggerKind: args.triggerKind,
			triggerRef: args.triggerRef ?? null,
			status: "running",
			input: args.input,
			accumulatedContext: args.initialContext,
			createdByUserId: args.userId,
			startedAt: new Date(),
		})
		.returning({ id: workflowRuns.id });
	if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	const runId = run.id;

	const resolveAgentRun = makeAgentRunResolver({
		organizationId: args.organizationId,
		userId: args.userId,
		v2ProjectId: args.pipeline.v2ProjectId ?? null,
		relayUrl: env.RELAY_URL,
		runId,
	});

	const executor = new WorkflowExecutor();
	const result = await executor.execute(state, args.input, {
		recorder: new DbRunRecorder(runId),
		// Pipelines have no published output schema; the executor skips output
		// validation when omitted.
		initialContext: args.initialContext,
		resolveAgentRun,
		// Cross-run emit seam (design §4.3): each finished agent_run node fires an
		// `agent_run_finished` event (+ `file_or_artifact_created` per artifact) so
		// downstream pipelines / feedback nodes can trigger off it.
		onAgentRunFinished: (info) =>
			emitAgentRunFinished(
				{
					organizationId: args.organizationId,
					v2ProjectId: args.pipeline.v2ProjectId ?? null,
				},
				info,
			),
	});

	// Persist terminal state + the final accumulating context.
	await db
		.update(workflowRuns)
		.set({
			status: result.status,
			output: result.output ?? null,
			error: result.error ?? null,
			accumulatedContext: result.accumulatedContext ?? args.initialContext,
			endedAt: result.status === "waiting_approval" ? null : new Date(),
		})
		.where(eq(workflowRuns.id, runId));

	// Object-graph link: pipeline produced run.
	await db
		.insert(objectRelations)
		.values({
			organizationId: args.organizationId,
			sourceType: "workflow",
			sourceId: args.pipeline.id,
			relationType: "produced_run",
			targetType: "run",
			targetId: runId,
		})
		.onConflictDoNothing();

	return {
		runId,
		status: result.status,
		output: result.output,
		error: result.error
			? { code: result.error.code, message: result.error.message }
			: undefined,
		approvalBlockId: result.pendingApproval?.blockId,
	};
}
