import { dbWs } from "@rox/db/client";
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
import { buildPipelineHandlers } from "./handlers";

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
	/** Optional node to start at when an event trigger is bound to a graph node. */
	entryNodeId?: string;
	/** Seed message + transcript threaded into every agent_run node (design §5). */
	initialContext: AccumulatedContext;
	/**
	 * The run that triggered this one, when fired by the cross-run dispatcher off
	 * another run's `agent_run_finished` event. Persisted to
	 * `workflow_runs.parentRunId` so the dispatcher can walk the ancestor chain
	 * and refuse to re-fire a pipeline already in it (recursion guard, §3.3).
	 * Undefined for top-level runs (manual `runOnce`, host-originating events).
	 */
	parentRunId?: string;
}

/**
 * Injectable seams for `runPipeline`. Real callers never pass these — the
 * defaults wire the production resolver / emit / executor. They exist so tests
 * can substitute those collaborators WITHOUT a process-global
 * `mock.module("./agent-run-service" | "./agent-run-events" |
 * "@rox/workflow-runtime")`, which in bun leaks across every sibling test file
 * in the directory (the same module registry is shared for the whole run) and
 * made the sibling `agent-run-service` / `agent-run-events` suites
 * order-dependently flaky. This mirrors the executor's existing `resolveAgentRun`
 * injection style.
 */
export interface RunPipelineDeps {
	makeAgentRunResolver: typeof makeAgentRunResolver;
	emitAgentRunFinished: typeof emitAgentRunFinished;
	createExecutor: () => Pick<WorkflowExecutor, "execute">;
}

const defaultRunPipelineDeps: RunPipelineDeps = {
	makeAgentRunResolver,
	emitAgentRunFinished,
	createExecutor: () => new WorkflowExecutor(),
};

export interface RunPipelineResult {
	runId: string;
	status: RunStatus;
	output?: Record<string, unknown>;
	error?: { code: string; message: string };
	approvalBlockId?: string;
	/**
	 * The approver-facing instruction from the paused `human_approval` node's
	 * `subBlocks.approvalMessage` (NodeInspector #407), when set. The caller
	 * (pipeline.runOnce) stamps it onto the `approval_requests` row so the inbox
	 * surfaces "what to confirm". Undefined when no message was configured.
	 */
	approvalMessage?: string;
}

/** Persists each executor step to workflow_run_steps (payloads already redacted). */
class DbRunRecorder implements RunRecorder {
	constructor(private readonly runId: string) {}
	async recordStep(step: StepRecord): Promise<void> {
		await dbWs.insert(workflowRunSteps).values({
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
	deps: RunPipelineDeps = defaultRunPipelineDeps,
): Promise<RunPipelineResult> {
	const state = args.pipeline.draftState;

	const [run] = await dbWs
		.insert(workflowRuns)
		.values({
			organizationId: args.organizationId,
			v2ProjectId: args.pipeline.v2ProjectId,
			workflowId: args.pipeline.id,
			// Provenance for the recursion guard: the run whose agent_run_finished
			// event fired this one (null for top-level runs).
			parentRunId: args.parentRunId ?? null,
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

	const resolveAgentRun = deps.makeAgentRunResolver({
		organizationId: args.organizationId,
		userId: args.userId,
		v2ProjectId: args.pipeline.v2ProjectId ?? null,
		relayUrl: env.RELAY_URL,
		runId,
	});

	const executor = deps.createExecutor();
	const result = await executor.execute(state, args.input, {
		recorder: new DbRunRecorder(runId),
		// Executor node handlers (model, and sibling issues' condition/http/db/…).
		// agent_run/skill_call keep their dedicated resolver seams below.
		handlers: buildPipelineHandlers({
			organizationId: args.organizationId,
			v2ProjectId: args.pipeline.v2ProjectId ?? null,
			// Actor + relay scope for the tool nodes (#545): the MCP ports mint the
			// org-scoped MCP context from these (same JWT-mint as the HTTP MCP route).
			userId: args.userId,
			relayUrl: env.RELAY_URL,
		}),
		// Pipelines have no published output schema; the executor skips output
		// validation when omitted.
		entryNodeId: args.entryNodeId,
		initialContext: args.initialContext,
		resolveAgentRun,
		// Cross-run emit seam (design §4.3): each finished agent_run node fires an
		// `agent_run_finished` event (+ `file_or_artifact_created` per artifact) so
		// downstream pipelines / feedback nodes can trigger off it.
		onAgentRunFinished: (info) =>
			deps.emitAgentRunFinished(
				{
					organizationId: args.organizationId,
					v2ProjectId: args.pipeline.v2ProjectId ?? null,
					runId,
				},
				info,
			),
	});

	// Persist terminal state + the final accumulating context.
	await dbWs
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
	await dbWs
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
		approvalMessage: result.pendingApproval?.approvalMessage,
	};
}
