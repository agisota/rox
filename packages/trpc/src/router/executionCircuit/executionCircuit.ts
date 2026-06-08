import { db } from "@rox/db/client";
import {
	executionCircuits,
	experienceTraceEvents,
	tasks,
	transitionRuns,
} from "@rox/db/schema";
import {
	compileTransitionPrompt as compileTransitionPromptFn,
	computeMonadCompleteness,
	defaultCircuitForTask,
	type ExecutionCircuitSpec,
	evaluateCircuitSecurity,
	evaluateTransitionSecurity,
	planExecutionPath,
	validateExecutionCircuitSpec,
} from "@rox/workflow-core";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { getCircuitForOrg, getCircuitForTask } from "./access";
import {
	appendTraceEventSchema,
	compileTransitionPromptSchema,
	completeTransitionRunSchema,
	createDraftForTaskSchema,
	createTransitionRunSchema,
	taskIdSchema,
	upsertSpecSchema,
	validateSpecSchema,
} from "./schema";

/** Load a task scoped to the org (NOT_FOUND otherwise). */
async function getTaskForOrg(organizationId: string, taskId: string) {
	const [row] = await db
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, taskId), eq(tasks.organizationId, organizationId)))
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
	}
	return row;
}

/** Load a transition run scoped to the org (NOT_FOUND otherwise). */
async function getTransitionRunForOrg(
	organizationId: string,
	transitionRunId: string,
) {
	const [row] = await db
		.select()
		.from(transitionRuns)
		.where(
			and(
				eq(transitionRuns.id, transitionRunId),
				eq(transitionRuns.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Transition run not found",
		});
	}
	return row;
}

export const executionCircuitRouter = {
	getByTaskId: protectedProcedure
		.input(taskIdSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return getCircuitForTask(organizationId, input.taskId);
		}),

	createDraftForTask: protectedProcedure
		.input(createDraftForTaskSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const task = await getTaskForOrg(organizationId, input.taskId);

			const existing = await getCircuitForTask(organizationId, input.taskId);
			if (existing) {
				return existing;
			}

			const spec = defaultCircuitForTask({
				title: task.title,
				description: task.description,
				priority: task.priority,
			});

			const [row] = await db
				.insert(executionCircuits)
				.values({
					organizationId,
					taskId: input.taskId,
					spec,
					status: "pending",
				})
				.returning();
			if (!row) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create execution circuit",
				});
			}
			return row;
		}),

	upsertSpec: protectedProcedure
		.input(upsertSpecSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getTaskForOrg(organizationId, input.taskId);

			const spec = input.spec as ExecutionCircuitSpec;
			const validation = validateExecutionCircuitSpec(spec);
			if (!validation.valid) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Cannot save an invalid execution circuit spec",
					cause: validation.issues,
				});
			}

			const existing = await getCircuitForTask(organizationId, input.taskId);
			if (existing) {
				const [row] = await db
					.update(executionCircuits)
					.set({ spec, version: existing.version + 1 })
					.where(eq(executionCircuits.id, existing.id))
					.returning();
				return row;
			}

			const [row] = await db
				.insert(executionCircuits)
				.values({ organizationId, taskId: input.taskId, spec })
				.returning();
			return row;
		}),

	validateSpec: protectedProcedure
		.input(validateSpecSchema)
		.query(async ({ ctx, input }) => {
			await requireActiveOrgMembership(ctx);
			const spec = input.spec as ExecutionCircuitSpec;
			const validation = validateExecutionCircuitSpec(spec);
			const completeness = spec.transitions.map((transition) => ({
				transitionId: transition.id,
				completeness: computeMonadCompleteness(transition.monad),
			}));
			return { validation, completeness };
		}),

	compileTransitionPrompt: protectedProcedure
		.input(compileTransitionPromptSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const circuit = await getCircuitForTask(organizationId, input.taskId);
			if (!circuit) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Execution circuit not found",
				});
			}
			const spec = circuit.spec;
			const exists = spec.transitions.some((t) => t.id === input.transitionId);
			if (!exists) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Unknown transition "${input.transitionId}"`,
				});
			}
			return compileTransitionPromptFn(spec, input.transitionId);
		}),

	getExecutionPlan: protectedProcedure
		.input(taskIdSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const circuit = await getCircuitForTask(organizationId, input.taskId);
			if (!circuit) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Execution circuit not found",
				});
			}
			// The planner returns the ordered transition path to the TargetState;
			// the security decision tells the run service which of those steps are
			// permitted to execute. Both are pure functions of the persisted spec.
			return {
				plan: planExecutionPath(circuit.spec),
				security: evaluateCircuitSecurity(circuit.spec),
			};
		}),

	createTransitionRun: protectedProcedure
		.input(createTransitionRunSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const circuit = await getCircuitForOrg(organizationId, input.circuitId);

			const spec = circuit.spec;
			const transition = spec.transitions.find(
				(t) => t.id === input.transitionId,
			);
			if (!transition) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Unknown transition "${input.transitionId}"`,
				});
			}

			// Security predicate: never start a run for a transition that is not
			// permitted to execute (e.g. an agent/tool binding with no checkable
			// output contract, or a runtime kind outside the allowlist).
			const security = evaluateTransitionSecurity(transition);
			if (!security.allowed) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: `Transition "${input.transitionId}" is not permitted to execute`,
					cause: security.violations,
				});
			}

			const compiled = compileTransitionPromptFn(spec, input.transitionId);
			const [row] = await db
				.insert(transitionRuns)
				.values({
					organizationId,
					executionCircuitId: circuit.id,
					transitionId: input.transitionId,
					status: "running",
					compiledPrompt: compiled.prompt,
					input: input.input ?? null,
					startedAt: new Date(),
				})
				.returning();
			if (!row) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create transition run",
				});
			}
			return row;
		}),

	appendTraceEvent: protectedProcedure
		.input(appendTraceEventSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getTransitionRunForOrg(organizationId, input.transitionRunId);

			const [last] = await db
				.select({ seq: experienceTraceEvents.seq })
				.from(experienceTraceEvents)
				.where(eq(experienceTraceEvents.transitionRunId, input.transitionRunId))
				.orderBy(desc(experienceTraceEvents.seq))
				.limit(1);
			const seq = (last?.seq ?? 0) + 1;

			const [row] = await db
				.insert(experienceTraceEvents)
				.values({
					organizationId,
					transitionRunId: input.transitionRunId,
					kind: input.kind,
					payload: input.payload ?? null,
					seq,
				})
				.returning();
			return row;
		}),

	completeTransitionRun: protectedProcedure
		.input(completeTransitionRunSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getTransitionRunForOrg(organizationId, input.transitionRunId);

			const [row] = await db
				.update(transitionRuns)
				.set({
					status: input.status,
					output: input.output ?? null,
					error: input.error ?? null,
					completedAt: new Date(),
				})
				.where(eq(transitionRuns.id, input.transitionRunId))
				.returning();
			return row;
		}),
} satisfies TRPCRouterRecord;
