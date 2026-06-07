import { db, dbWs } from "@rox/db/client";
import {
	workflowDefinitions,
	workflowDeployments,
	workflowVersions,
} from "@rox/db/schema";
import { type RoxWorkflowState, validateGraph } from "@rox/workflow-core";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { getWorkflowDraftForOrg } from "./access";
import {
	createWorkflowDraftSchema,
	createWorkflowVersionSchema,
	deployWorkflowSchema,
	listWorkflowsSchema,
	updateWorkflowDraftStateSchema,
	validateWorkflowDraftSchema,
	workflowIdSchema,
} from "./schema";

function emptyDraft(name: string): RoxWorkflowState {
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

export const workflowRouter = {
	list: protectedProcedure
		.input(listWorkflowsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [
				eq(workflowDefinitions.organizationId, organizationId),
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
		.input(workflowIdSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return getWorkflowDraftForOrg(organizationId, input.workflowId);
		}),

	createDraft: protectedProcedure
		.input(createWorkflowDraftSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const draftState =
				(input.draftState as RoxWorkflowState | undefined) ??
				emptyDraft(input.name);
			const [row] = await db
				.insert(workflowDefinitions)
				.values({
					organizationId,
					ownerUserId: ctx.session.user.id,
					v2ProjectId: input.v2ProjectId ?? null,
					name: input.name,
					slug: input.slug,
					description: input.description ?? null,
					draftState,
				})
				.returning();
			if (!row) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create workflow",
				});
			}
			return row;
		}),

	updateDraftState: protectedProcedure
		.input(updateWorkflowDraftStateSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getWorkflowDraftForOrg(organizationId, input.workflowId);
			const [row] = await db
				.update(workflowDefinitions)
				.set({ draftState: input.draftState as RoxWorkflowState })
				.where(eq(workflowDefinitions.id, input.workflowId))
				.returning();
			return row;
		}),

	validateDraft: protectedProcedure
		.input(validateWorkflowDraftSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			let state = input.draftState as RoxWorkflowState | undefined;
			if (!state && input.workflowId) {
				const wf = await getWorkflowDraftForOrg(
					organizationId,
					input.workflowId,
				);
				state = wf.draftState;
			}
			if (!state) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Provide either workflowId or draftState",
				});
			}
			return validateGraph(state);
		}),

	createVersion: protectedProcedure
		.input(createWorkflowVersionSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const wf = await getWorkflowDraftForOrg(organizationId, input.workflowId);

			const validation = validateGraph(wf.draftState);
			if (!validation.valid) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Cannot version an invalid workflow draft",
					cause: validation.issues,
				});
			}

			const [latest] = await db
				.select({ versionNumber: workflowVersions.versionNumber })
				.from(workflowVersions)
				.where(eq(workflowVersions.workflowId, wf.id))
				.orderBy(desc(workflowVersions.versionNumber))
				.limit(1);
			const versionNumber = (latest?.versionNumber ?? 0) + 1;

			const [row] = await db
				.insert(workflowVersions)
				.values({
					workflowId: wf.id,
					organizationId,
					versionNumber,
					stateSnapshot: wf.draftState,
					validationSnapshot: validation,
					changelog: input.changelog ?? null,
					createdByUserId: ctx.session.user.id,
				})
				.returning();
			return row;
		}),

	deploy: protectedProcedure
		.input(deployWorkflowSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const wf = await getWorkflowDraftForOrg(organizationId, input.workflowId);

			// Resolve the version to deploy (explicit, or latest).
			let versionId = input.workflowVersionId;
			if (!versionId) {
				const [latest] = await db
					.select({ id: workflowVersions.id })
					.from(workflowVersions)
					.where(eq(workflowVersions.workflowId, wf.id))
					.orderBy(desc(workflowVersions.versionNumber))
					.limit(1);
				if (!latest) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Create a version before deploying",
					});
				}
				versionId = latest.id;
			}

			return dbWs.transaction(async (tx) => {
				// Only one active deployment per (workflow, environment).
				await tx
					.update(workflowDeployments)
					.set({ status: "inactive" })
					.where(
						and(
							eq(workflowDeployments.workflowId, wf.id),
							eq(workflowDeployments.environment, input.environment),
							eq(workflowDeployments.status, "active"),
						),
					);
				const [deployment] = await tx
					.insert(workflowDeployments)
					.values({
						workflowId: wf.id,
						workflowVersionId: versionId,
						organizationId,
						environment: input.environment,
						status: "active",
						deployedByUserId: ctx.session.user.id,
					})
					.returning();
				await tx
					.update(workflowDefinitions)
					.set({ status: "published" })
					.where(eq(workflowDefinitions.id, wf.id));
				return deployment;
			});
		}),

	archive: protectedProcedure
		.input(workflowIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getWorkflowDraftForOrg(organizationId, input.workflowId);
			const [row] = await db
				.update(workflowDefinitions)
				.set({ status: "archived" })
				.where(eq(workflowDefinitions.id, input.workflowId))
				.returning();
			return row;
		}),
} satisfies TRPCRouterRecord;
