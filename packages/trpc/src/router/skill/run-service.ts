import { db } from "@rox/db/client";
import {
	objectRelations,
	skills,
	skillVersions,
	workflowDeployments,
	workflowRunSteps,
	workflowRuns,
	workflowVersions,
} from "@rox/db/schema";
import {
	type AccumulatedContext,
	evaluateGraphPolicy,
	hasDenial,
	type JsonSchema,
	type RoxWorkflowState,
	validateInput,
	type WorkflowPolicy,
} from "@rox/workflow-core";
import {
	type AgentRunResolver,
	type RunRecorder,
	type RunStatus,
	type StepRecord,
	WorkflowExecutor,
} from "@rox/workflow-runtime";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { emitAgentRunFinished } from "../pipeline/agent-run-events";
import { assertRunModeAllowed } from "./helpers";

const MAX_SKILL_CALL_DEPTH = 5;

/**
 * How a run was triggered. Manual/command/schedule/webhook/api/mcp/chat are the
 * classic skill triggers; the remaining values are Agent Pipelines event
 * triggers (design spec §1.2 / §2.4) — all members of the `trigger_kind` pgEnum
 * in `@rox/db`. `all_prior_agents_finished` is a graph JOIN, not a trigger kind.
 */
export type RunSkillTriggerKind =
	| "manual"
	| "command"
	| "chat"
	| "schedule"
	| "webhook"
	| "api"
	| "mcp"
	| "repo_connected"
	| "file_uploaded"
	| "agent_run_finished"
	| "project_initialized"
	| "service_connected";

export interface RunSkillArgs {
	organizationId: string;
	userId: string;
	skillId: string;
	runMode: string;
	triggerKind: RunSkillTriggerKind;
	/** Event-specific provenance persisted to `workflow_runs.triggerRef`. */
	triggerRef?: Record<string, unknown>;
	input: Record<string, unknown>;
	/** Resolved approvals for resume. */
	approvals?: Record<string, "approved" | "rejected">;
	/** Reuse an existing run row (resume); steps are reset first. */
	existingRunId?: string;
	secrets?: Record<string, string>;
	v2ProjectId?: string | null;
	/**
	 * Resolves `agent_run` blocks to agent executions (chat in-process or CLI in a
	 * worktree). Injected by the pipeline layer; plain skills omit it.
	 */
	resolveAgentRun?: AgentRunResolver;
	/**
	 * Seeds the run's accumulating context (message + transcript) threaded into
	 * `agent_run` nodes. The pipeline layer supplies it; plain skills omit it.
	 */
	initialContext?: AccumulatedContext;
	depth?: number;
}

export interface RunSkillResult {
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

async function loadSkillAndVersion(organizationId: string, skillId: string) {
	const [skill] = await db
		.select()
		.from(skills)
		.where(
			and(eq(skills.id, skillId), eq(skills.organizationId, organizationId)),
		)
		.limit(1);
	if (!skill) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });
	}
	if (!skill.currentVersionId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Skill has no published version",
		});
	}
	const [version] = await db
		.select()
		.from(skillVersions)
		.where(eq(skillVersions.id, skill.currentVersionId))
		.limit(1);
	if (!version) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Skill version missing",
		});
	}
	return { skill, version };
}

async function loadDeployedState(
	deploymentId: string,
): Promise<RoxWorkflowState> {
	const [deployment] = await db
		.select()
		.from(workflowDeployments)
		.where(eq(workflowDeployments.id, deploymentId))
		.limit(1);
	if (!deployment) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workflow deployment not found",
		});
	}
	const [version] = await db
		.select({ stateSnapshot: workflowVersions.stateSnapshot })
		.from(workflowVersions)
		.where(eq(workflowVersions.id, deployment.workflowVersionId))
		.limit(1);
	if (!version) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workflow version not found",
		});
	}
	return version.stateSnapshot;
}

/**
 * Execute a skill end-to-end against the database: enforce run mode + input
 * schema + policy, create/resume a workflow_run, run the graph via the
 * WorkflowExecutor (persisting steps, redacted), spawn child runs for nested
 * skill calls, gate on human approval, validate output, and link the run into
 * the object graph.
 */
export async function runSkill(args: RunSkillArgs): Promise<RunSkillResult> {
	const depth = args.depth ?? 0;
	const { skill, version } = await loadSkillAndVersion(
		args.organizationId,
		args.skillId,
	);

	assertRunModeAllowed(version.runModes, args.runMode);

	const inputIssues = validateInput(args.input, version.inputSchema);
	if (inputIssues.length > 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Input does not match the skill input schema",
			cause: inputIssues,
		});
	}

	if (!version.workflowDeploymentId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Only workflow-backed skills are executable here (legacy/sim/tool wiring is separate).",
		});
	}
	const state = await loadDeployedState(version.workflowDeploymentId);

	// Policy: hard denials block the run.
	const policy = (version.policy ?? {}) as WorkflowPolicy;
	const decisions = evaluateGraphPolicy(state, policy);
	if (hasDenial(decisions)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `Policy denied this run: ${decisions.find((d) => d.effect === "deny")?.message}`,
		});
	}

	// Create or resume the run row.
	let runId = args.existingRunId;
	if (runId) {
		await db.delete(workflowRunSteps).where(eq(workflowRunSteps.runId, runId));
		await db
			.update(workflowRuns)
			.set({ status: "running" })
			.where(eq(workflowRuns.id, runId));
	} else {
		const [run] = await db
			.insert(workflowRuns)
			.values({
				organizationId: args.organizationId,
				v2ProjectId: args.v2ProjectId ?? null,
				skillId: skill.id,
				skillVersionId: version.id,
				triggerKind: args.triggerKind,
				triggerRef: args.triggerRef ?? null,
				status: "running",
				input: args.input,
				accumulatedContext: args.initialContext ?? null,
				createdByUserId: args.userId,
				startedAt: new Date(),
			})
			.returning({ id: workflowRuns.id });
		if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
		runId = run.id;
	}

	const executor = new WorkflowExecutor();
	const result = await executor.execute(state, args.input, {
		recorder: new DbRunRecorder(runId),
		outputSchema: version.outputSchema as JsonSchema,
		secrets: args.secrets,
		approvals: args.approvals,
		// Pipeline layer: thread the accumulating context + agent_run resolver
		// (chat in-proc | CLI via relay). Plain skills leave both undefined.
		initialContext: args.initialContext,
		resolveAgentRun: args.resolveAgentRun,
		// Cross-run emit seam (design §4.3): a published skill graph may also
		// contain agent_run nodes; fire agent_run_finished (+ artifact events)
		// when one completes so pipelines can trigger off it.
		onAgentRunFinished: (info) =>
			emitAgentRunFinished(
				{
					organizationId: args.organizationId,
					v2ProjectId: args.v2ProjectId ?? null,
					runId,
				},
				info,
			),
		resolveSkillCall: async (slug, childInput) => {
			if (depth + 1 > MAX_SKILL_CALL_DEPTH) {
				return {
					error: {
						code: "NESTED_WORKFLOW_DEPTH_EXCEEDED",
						message: `Skill-call depth exceeded ${MAX_SKILL_CALL_DEPTH}`,
					},
				};
			}
			const [child] = await db
				.select({ id: skills.id })
				.from(skills)
				.where(
					and(
						eq(skills.slug, slug),
						eq(skills.organizationId, args.organizationId),
					),
				)
				.limit(1);
			if (!child) {
				return { error: { code: "SKILL_NOT_FOUND", message: slug } };
			}
			const childResult = await runSkill({
				...args,
				skillId: child.id,
				input: childInput,
				runMode: "workflow_node",
				existingRunId: undefined,
				approvals: undefined,
				// A nested skill_call is its own workflow run, not part of the
				// parent pipeline's accumulating transcript: don't inherit
				// pipeline context/provenance or the agent_run resolver.
				triggerRef: undefined,
				initialContext: undefined,
				resolveAgentRun: undefined,
				depth: depth + 1,
			});
			// Link parent <- child.
			await db
				.update(workflowRuns)
				.set({ parentRunId: runId })
				.where(eq(workflowRuns.id, childResult.runId));
			if (childResult.status !== "succeeded") {
				return {
					error: childResult.error ?? {
						code: "CHILD_RUN_FAILED",
						message: childResult.status,
					},
					childRunId: childResult.runId,
				};
			}
			return { output: childResult.output, childRunId: childResult.runId };
		},
	});

	// Persist terminal state (+ the final accumulating context for pipelines).
	await db
		.update(workflowRuns)
		.set({
			status: result.status,
			output: result.output ?? null,
			error: result.error ?? null,
			accumulatedContext:
				result.accumulatedContext ?? args.initialContext ?? null,
			endedAt: result.status === "waiting_approval" ? null : new Date(),
		})
		.where(eq(workflowRuns.id, runId));

	// Object-graph link: skill produced run.
	await db
		.insert(objectRelations)
		.values({
			organizationId: args.organizationId,
			sourceType: "skill",
			sourceId: skill.id,
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
