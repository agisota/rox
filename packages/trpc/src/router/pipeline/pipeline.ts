import { db } from "@rox/db/client";
import {
	approvalRequests,
	workflowDefinitions,
	workflowRunSteps,
	workflowRuns,
} from "@rox/db/schema";
import {
	createAccumulatedContext,
	type RoxWorkflowState,
	validateGraph,
} from "@rox/workflow-core";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { getPipelineForOrg } from "./access";
import { ingestPipelineEvent } from "./ingest-event";
import { buildReplayArgs } from "./replay";
import { runPipeline } from "./run-pipeline";
import {
	createPipelineSchema,
	getPipelineRunSchema,
	ingestEventSchema,
	listPipelineRunsSchema,
	listPipelinesSchema,
	pipelineIdSchema,
	replayPipelineRunSchema,
	runPipelineSchema,
	updatePipelineGraphSchema,
	validatePipelineSchema,
} from "./schema";

/** An empty pipeline graph: a single Start node, no agent nodes yet. */
function emptyPipelineDraft(name: string): RoxWorkflowState {
	return {
		blocks: {
			start: { type: "start", name: "Start", position: { x: 0, y: 0 } },
		},
		edges: [],
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name },
	};
}

/**
 * pipelineRouter — CRUD for a project's agent pipeline (the agent graph:
 * nodes=agent-roles, edges, triggers, loop/approval config), graph validation
 * (reuses the workflow-core validators), and a "run pipeline" entry that creates
 * a pipeline/workflow run.
 *
 * A pipeline IS a `workflow_definitions` row with `engine="pipeline"` — we reuse
 * the Automation Fabric tables verbatim, never greenfield. Pipeline runs reuse
 * `workflow_runs`; roles reuse `skills(kind="agent")`; triggers live in the
 * `pipeline_triggers` registry (see the trigger router).
 */
export const pipelineRouter = {
	list: protectedProcedure
		.input(listPipelinesSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [
				eq(workflowDefinitions.organizationId, organizationId),
				// Only pipelines, not plain workflows.
				eq(workflowDefinitions.engine, "pipeline"),
			];
			if (input?.v2ProjectId) {
				conditions.push(eq(workflowDefinitions.v2ProjectId, input.v2ProjectId));
			}
			return db
				.select()
				.from(workflowDefinitions)
				.where(and(...conditions))
				.orderBy(desc(workflowDefinitions.updatedAt));
		}),

	get: protectedProcedure
		.input(pipelineIdSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return getPipelineForOrg(organizationId, input.pipelineId);
		}),

	createDraft: protectedProcedure
		.input(createPipelineSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const draftState =
				(input.draftState as RoxWorkflowState | undefined) ??
				emptyPipelineDraft(input.name);
			const [row] = await db
				.insert(workflowDefinitions)
				.values({
					organizationId,
					ownerUserId: ctx.session.user.id,
					v2ProjectId: input.v2ProjectId ?? null,
					name: input.name,
					slug: input.slug,
					description: input.description ?? null,
					engine: "pipeline",
					draftState,
				})
				.returning();
			if (!row) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create pipeline",
				});
			}
			return row;
		}),

	updateGraph: protectedProcedure
		.input(updatePipelineGraphSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPipelineForOrg(organizationId, input.pipelineId);
			const [row] = await db
				.update(workflowDefinitions)
				.set({ draftState: input.draftState as RoxWorkflowState })
				.where(eq(workflowDefinitions.id, input.pipelineId))
				.returning();
			return row;
		}),

	/** Validate a pipeline graph (reuses the workflow-core graph validators). */
	validate: protectedProcedure
		.input(validatePipelineSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			let state = input.draftState as RoxWorkflowState | undefined;
			if (!state && input.pipelineId) {
				const pipeline = await getPipelineForOrg(
					organizationId,
					input.pipelineId,
				);
				state = pipeline.draftState;
			}
			if (!state) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Provide either pipelineId or draftState",
				});
			}
			return validateGraph(state);
		}),

	archive: protectedProcedure
		.input(pipelineIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPipelineForOrg(organizationId, input.pipelineId);
			const [row] = await db
				.update(workflowDefinitions)
				.set({ status: "archived" })
				.where(eq(workflowDefinitions.id, input.pipelineId))
				.returning();
			return row;
		}),

	/**
	 * Run a pipeline once: validate the graph, then create a pipeline/workflow
	 * run seeded with the originating message + accumulating context, executed
	 * via the shared run path (design §1 concept seam → runPipeline → executor
	 * agent_run branch).
	 */
	runOnce: protectedProcedure
		.input(runPipelineSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const pipeline = await getPipelineForOrg(
				organizationId,
				input.pipelineId,
			);

			const validation = validateGraph(pipeline.draftState);
			if (!validation.valid) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Cannot run an invalid pipeline graph",
					cause: validation.issues,
				});
			}

			const result = await runPipeline({
				organizationId,
				userId: ctx.session.user.id,
				pipeline,
				triggerKind: "manual",
				input: input.input,
				initialContext: createAccumulatedContext(input.seedMessage),
			});

			// A paused run records a pending approval the inbox can resolve
			// (pipelines inherit human_approval gates for free).
			if (result.status === "waiting_approval" && result.approvalBlockId) {
				await db.insert(approvalRequests).values({
					organizationId,
					runId: result.runId,
					blockId: result.approvalBlockId,
					status: "pending",
					requestedByUserId: ctx.session.user.id,
					// Surface the human_approval node's approvalMessage (NodeInspector
					// #407) as the row title so the inbox shows "what to confirm".
					// Null when the author configured no message (column is nullable).
					title: result.approvalMessage ?? null,
				});
			}
			return result;
		}),

	/**
	 * Host → main relay for REAL host-originating pipeline events (design §4.3).
	 *
	 * The desktop host runs on local SQLite and cannot reach this Neon-backed
	 * dispatcher, so its chat-send and CLI-agent-finished seams relay the event
	 * here through the host's authenticated api client. We resolve org from the
	 * caller's verified membership (never trust a host-supplied org), resolve the
	 * project scope server-side, build the typed event, and hand it to the shared
	 * `publishPipelineEvent` → `dispatchPipelineEvent` fan-out.
	 *
	 * Fire-and-forget by contract on the host side; here it returns whether a
	 * scope was resolved + the event published, so the host can log a no-op.
	 */
	ingestEvent: protectedProcedure
		.input(ingestEventSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return ingestPipelineEvent({ organizationId, input });
		}),

	listRuns: protectedProcedure
		.input(listPipelineRunsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPipelineForOrg(organizationId, input.pipelineId);
			return db
				.select()
				.from(workflowRuns)
				.where(
					and(
						eq(workflowRuns.organizationId, organizationId),
						eq(workflowRuns.workflowId, input.pipelineId),
					),
				)
				.orderBy(desc(workflowRuns.createdAt))
				.limit(input.limit);
		}),

	/**
	 * Fetch a single pipeline run with its ordered steps — the data the canvas
	 * run monitor renders for live run/step status. Org-scoped: the run must
	 * belong to the named pipeline (authorized via {@link getPipelineForOrg}).
	 */
	getRun: protectedProcedure
		.input(getPipelineRunSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPipelineForOrg(organizationId, input.pipelineId);
			const [run] = await db
				.select()
				.from(workflowRuns)
				.where(
					and(
						eq(workflowRuns.id, input.runId),
						eq(workflowRuns.organizationId, organizationId),
						eq(workflowRuns.workflowId, input.pipelineId),
					),
				)
				.limit(1);
			if (!run) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
			}
			// Steps are recorded in topological execution order; `startedAt` reflects
			// when each block ran (null for not-yet-started steps).
			const steps = await db
				.select()
				.from(workflowRunSteps)
				.where(eq(workflowRunSteps.runId, input.runId))
				.orderBy(workflowRunSteps.startedAt);
			return { run, steps };
		}),

	/**
	 * Replay a saved run (issue #553). Whole-run replay re-fires the source run's
	 * persisted `input` as a fresh run, threading the source's `accumulatedContext`
	 * seed so the replay starts from the same originating message. Provenance is
	 * stamped via `parentRunId` (the source run) + a `replay`-marked `triggerRef`,
	 * so the trace UI / dispatcher can tell a replay from an original.
	 *
	 * With `fromStepBlockId` set it becomes a re-run-from-step: the executor enters
	 * at that node (existing `entryNodeId` seam) seeded from that step's recorded
	 * `input` (the payload the node received from its upstream).
	 *
	 * Reuses {@link runPipeline} verbatim — replay is "run again with a recorded
	 * input", not a new execution path.
	 */
	replayRun: protectedProcedure
		.input(replayPipelineRunSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const pipeline = await getPipelineForOrg(
				organizationId,
				input.pipelineId,
			);

			// Authorize + load the source run (org- and pipeline-scoped, mirroring
			// getRun) — never replay a run from another org/pipeline.
			const [sourceRun] = await db
				.select()
				.from(workflowRuns)
				.where(
					and(
						eq(workflowRuns.id, input.runId),
						eq(workflowRuns.organizationId, organizationId),
						eq(workflowRuns.workflowId, input.pipelineId),
					),
				)
				.limit(1);
			if (!sourceRun) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
			}

			const replayArgs = buildReplayArgs({
				organizationId,
				userId: ctx.session.user.id,
				pipeline,
				sourceRun,
				fromStepBlockId: input.fromStepBlockId,
			});

			// A re-run-from-step seeds the entry node's input from its recorded step.
			if (input.fromStepBlockId) {
				const [step] = await db
					.select()
					.from(workflowRunSteps)
					.where(
						and(
							eq(workflowRunSteps.runId, input.runId),
							eq(workflowRunSteps.blockId, input.fromStepBlockId),
						),
					)
					.limit(1);
				if (!step) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Cannot re-run from a step that has no recorded execution",
					});
				}
				// The node re-receives the exact payload it got the first time.
				replayArgs.input = (step.input as Record<string, unknown>) ?? {};
				replayArgs.entryNodeId = input.fromStepBlockId;
			}

			const result = await runPipeline(replayArgs);

			// Replays inherit human_approval gates exactly like runOnce.
			if (result.status === "waiting_approval" && result.approvalBlockId) {
				await db.insert(approvalRequests).values({
					organizationId,
					runId: result.runId,
					blockId: result.approvalBlockId,
					status: "pending",
					requestedByUserId: ctx.session.user.id,
					title: result.approvalMessage ?? null,
				});
			}
			return result;
		}),
} satisfies TRPCRouterRecord;
