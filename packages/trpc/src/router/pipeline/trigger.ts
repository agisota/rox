import { db } from "@rox/db/client";
import { pipelineTriggers } from "@rox/db/schema";
import type { TriggerMatchConfig } from "@rox/workflow-core";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { getPipelineForOrg, getTriggerForOrg } from "./access";
import {
	createTriggerSchema,
	listTriggersSchema,
	setTriggerEnabledSchema,
	triggerIdSchema,
	updateTriggerSchema,
} from "./schema";

/**
 * Assert the named node id exists in the pipeline's draft graph (so a trigger
 * can't bind to a non-existent node).
 */
function assertNodeExists(
	draftBlocks: Record<string, unknown>,
	nodeId: string,
): void {
	if (!(nodeId in draftBlocks)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Node "${nodeId}" does not exist in the pipeline graph`,
		});
	}
}

/**
 * triggerRouter — CRUD for the `agent_triggers` registry (the `pipeline_triggers`
 * table): bind an event-kind → pipeline node, per project, enabled.
 *
 * This registry is the one genuinely new persistence object in Agent Pipelines;
 * the cross-run dispatcher reads it to fire matching nodes as runs. Every row is
 * org-scoped and validated against the bound pipeline + node id.
 */
export const triggerRouter = {
	/** List triggers, optionally filtered by project / pipeline / kind / enabled. */
	list: protectedProcedure
		.input(listTriggersSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [eq(pipelineTriggers.organizationId, organizationId)];
			if (input?.v2ProjectId) {
				conditions.push(eq(pipelineTriggers.v2ProjectId, input.v2ProjectId));
			}
			if (input?.pipelineId) {
				conditions.push(eq(pipelineTriggers.workflowId, input.pipelineId));
			}
			if (input?.triggerKind) {
				conditions.push(eq(pipelineTriggers.triggerKind, input.triggerKind));
			}
			if (input?.enabled !== undefined) {
				conditions.push(eq(pipelineTriggers.enabled, input.enabled));
			}
			return db
				.select()
				.from(pipelineTriggers)
				.where(and(...conditions))
				.orderBy(desc(pipelineTriggers.createdAt));
		}),

	get: protectedProcedure
		.input(triggerIdSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return getTriggerForOrg(organizationId, input.triggerId);
		}),

	/** Bind an event-kind → pipeline node (validates the pipeline + node exist). */
	create: protectedProcedure
		.input(createTriggerSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const pipeline = await getPipelineForOrg(
				organizationId,
				input.pipelineId,
			);
			assertNodeExists(pipeline.draftState.blocks, input.nodeId);
			// A trigger inherits the pipeline's project scope unless overridden.
			const v2ProjectId = input.v2ProjectId ?? pipeline.v2ProjectId ?? null;
			const [row] = await db
				.insert(pipelineTriggers)
				.values({
					organizationId,
					v2ProjectId,
					workflowId: pipeline.id,
					nodeId: input.nodeId,
					triggerKind: input.triggerKind,
					matchConfig: input.matchConfig as TriggerMatchConfig,
					enabled: input.enabled,
				})
				.returning();
			if (!row) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create trigger",
				});
			}
			return row;
		}),

	update: protectedProcedure
		.input(updateTriggerSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const existing = await getTriggerForOrg(organizationId, input.triggerId);
			// When the node id changes, validate it against the bound pipeline.
			if (input.nodeId !== undefined && input.nodeId !== existing.nodeId) {
				const pipeline = await getPipelineForOrg(
					organizationId,
					existing.workflowId,
				);
				assertNodeExists(pipeline.draftState.blocks, input.nodeId);
			}
			const [row] = await db
				.update(pipelineTriggers)
				.set({
					nodeId: input.nodeId ?? existing.nodeId,
					triggerKind: input.triggerKind ?? existing.triggerKind,
					matchConfig:
						input.matchConfig === undefined
							? existing.matchConfig
							: (input.matchConfig as TriggerMatchConfig),
					enabled: input.enabled ?? existing.enabled,
				})
				.where(eq(pipelineTriggers.id, input.triggerId))
				.returning();
			return row;
		}),

	setEnabled: protectedProcedure
		.input(setTriggerEnabledSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getTriggerForOrg(organizationId, input.triggerId);
			const [row] = await db
				.update(pipelineTriggers)
				.set({ enabled: input.enabled })
				.where(eq(pipelineTriggers.id, input.triggerId))
				.returning();
			return row;
		}),

	delete: protectedProcedure
		.input(triggerIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getTriggerForOrg(organizationId, input.triggerId);
			await db
				.delete(pipelineTriggers)
				.where(eq(pipelineTriggers.id, input.triggerId));
			return { ok: true };
		}),
} satisfies TRPCRouterRecord;
