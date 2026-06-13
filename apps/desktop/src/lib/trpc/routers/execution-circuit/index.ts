import {
	traceEventPayloadSchema,
	transitionRunOutputSchema,
	transitionValidationResultSchema,
} from "@rox/shared/execution-circuit";
import { TRPCError } from "@trpc/server";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	createExecutionCircuitService,
	ExecutionCircuitServiceError,
} from "./service";
import { createDrizzleExecutionCircuitStore } from "./store";

function createService() {
	return createExecutionCircuitService(
		createDrizzleExecutionCircuitStore(localDb),
	);
}

function toTrpcError(error: unknown): never {
	if (error instanceof ExecutionCircuitServiceError) {
		throw new TRPCError({
			code: error.code,
			message: error.message,
			cause: error.cause,
		});
	}
	throw error;
}

export const createExecutionCircuitRouter = () => {
	return router({
		getByTaskId: publicProcedure
			.input(z.object({ taskId: z.string().min(1) }))
			.query(({ input }) => createService().getByTaskId(input.taskId)),

		createDraftForTask: publicProcedure
			.input(z.object({ taskId: z.string().min(1) }))
			.mutation(({ input }) => {
				try {
					return createService().createDraftForTask(input.taskId);
				} catch (error) {
					toTrpcError(error);
				}
			}),

		upsertSpec: publicProcedure
			.input(
				z.object({
					taskId: z.string().min(1),
					spec: z.unknown(),
				}),
			)
			.mutation(({ input }) => {
				try {
					return createService().upsertSpec(input.taskId, input.spec);
				} catch (error) {
					toTrpcError(error);
				}
			}),

		validateSpec: publicProcedure
			.input(z.object({ spec: z.unknown() }))
			.query(({ input }) => createService().validateSpec(input.spec)),

		compileTransitionPrompt: publicProcedure
			.input(
				z.object({
					circuitId: z.string().min(1),
					transitionId: z.string().min(1),
				}),
			)
			.query(({ input }) => {
				try {
					return createService().compileTransitionPrompt(
						input.circuitId,
						input.transitionId,
					);
				} catch (error) {
					toTrpcError(error);
				}
			}),

		getTransitionGraph: publicProcedure
			.input(z.object({ circuitId: z.string().min(1) }))
			.query(({ input }) => {
				try {
					return createService().getTransitionGraph(input.circuitId);
				} catch (error) {
					toTrpcError(error);
				}
			}),

		exportSpec: publicProcedure
			.input(z.object({ circuitId: z.string().min(1) }))
			.query(({ input }) => {
				try {
					return createService().exportSpec(input.circuitId);
				} catch (error) {
					toTrpcError(error);
				}
			}),

		importSpecForTask: publicProcedure
			.input(
				z.object({
					taskId: z.string().min(1),
					serializedSpec: z.string().min(1),
				}),
			)
			.mutation(({ input }) => {
				try {
					return createService().importSpecForTask(
						input.taskId,
						input.serializedSpec,
					);
				} catch (error) {
					toTrpcError(error);
				}
			}),

		createTransitionRun: publicProcedure
			.input(
				z.object({
					circuitId: z.string().min(1),
					transitionId: z.string().min(1),
					workspaceId: z.string().min(1).optional(),
					agentRunId: z.string().min(1).optional(),
				}),
			)
			.mutation(({ input }) => {
				try {
					return createService().createTransitionRun(input);
				} catch (error) {
					toTrpcError(error);
				}
			}),

		createNextTransitionRun: publicProcedure
			.input(
				z.object({
					circuitId: z.string().min(1),
					workspaceId: z.string().min(1).optional(),
					agentRunId: z.string().min(1).optional(),
				}),
			)
			.mutation(({ input }) => {
				try {
					return createService().createNextTransitionRun(input);
				} catch (error) {
					toTrpcError(error);
				}
			}),

		appendTraceEvent: publicProcedure
			.input(
				z.object({
					transitionRunId: z.string().min(1),
					type: z.string().min(1),
					message: z.string().min(1),
					payload: traceEventPayloadSchema.optional(),
				}),
			)
			.mutation(({ input }) => {
				try {
					return createService().appendTraceEvent(input);
				} catch (error) {
					toTrpcError(error);
				}
			}),

		completeTransitionRun: publicProcedure
			.input(
				z.object({
					transitionRunId: z.string().min(1),
					output: transitionRunOutputSchema,
					validationResult: transitionValidationResultSchema,
				}),
			)
			.mutation(({ input }) => {
				try {
					return createService().completeTransitionRun(input);
				} catch (error) {
					toTrpcError(error);
				}
			}),

		runValidatorsForTransitionRun: publicProcedure
			.input(z.object({ transitionRunId: z.string().min(1) }))
			.mutation(async ({ input }) => {
				try {
					return await createService().runValidatorsForTransitionRun(
						input.transitionRunId,
					);
				} catch (error) {
					toTrpcError(error);
				}
			}),
	});
};
