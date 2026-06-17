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
import { runPipeline } from "./run-pipeline";
import {
	createPipelineSchema,
	getPipelineRunSchema,
	listPipelineRunsSchema,
	listPipelinesSchema,
	pipelineIdSchema,
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
				});
			}
			return result;
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
} satisfies TRPCRouterRecord;
