import { db, dbWs } from "@rox/db/client";
import {
	approvalRequests,
	skillBindings,
	skills,
	skillVersions,
	workflowDeployments,
	workflowRuns,
	workflowVersions,
} from "@rox/db/schema";
import {
	buildSkillNodeDefinition,
	type JsonSchema,
	validateGraph,
	validateInput,
} from "@rox/workflow-core";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { getWorkflowDraftForOrg } from "../workflow/access";
import {
	assertExactlyOneImplementationRef,
	assertPublishable,
	validatePublishInput,
} from "./helpers";
import { runSkill } from "./run-service";
import {
	bindSkillSchema,
	createInstructionSkillSchema,
	createSkillVersionSchema,
	listBindingsSchema,
	listSkillRunsSchema,
	listSkillsSchema,
	promoteVersionSchema,
	publishWorkflowSchema,
	runSkillSchema,
	skillIdSchema,
	unbindSchema,
	validateRunInputSchema,
} from "./schema";

async function getSkillForOrg(organizationId: string, skillId: string) {
	const [row] = await db
		.select()
		.from(skills)
		.where(
			and(eq(skills.id, skillId), eq(skills.organizationId, organizationId)),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });
	}
	return row;
}

async function getCurrentSkillVersion(
	skillId: string,
	currentVersionId: string | null,
) {
	if (!currentVersionId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Skill has no published version",
		});
	}
	const [version] = await db
		.select()
		.from(skillVersions)
		.where(
			and(
				eq(skillVersions.id, currentVersionId),
				eq(skillVersions.skillId, skillId),
			),
		)
		.limit(1);
	if (!version) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Skill version not found",
		});
	}
	return version;
}

export const skillRouter = {
	list: protectedProcedure
		.input(listSkillsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [eq(skills.organizationId, organizationId)];
			if (input?.v2ProjectId) {
				conditions.push(eq(skills.v2ProjectId, input.v2ProjectId));
			}
			return db
				.select()
				.from(skills)
				.where(and(...conditions))
				.orderBy(desc(skills.updatedAt));
		}),

	get: protectedProcedure.input(skillIdSchema).query(async ({ ctx, input }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return getSkillForOrg(organizationId, input.skillId);
	}),

	publishWorkflow: protectedProcedure
		.input(publishWorkflowSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const wf = await getWorkflowDraftForOrg(organizationId, input.workflowId);

			const inputSchema = input.inputSchema as JsonSchema;
			const outputSchema = input.outputSchema as JsonSchema;
			assertPublishable(
				validatePublishInput(wf.draftState, inputSchema, outputSchema),
			);
			const validation = validateGraph(wf.draftState);

			return dbWs.transaction(async (tx) => {
				const [latestVersion] = await tx
					.select({ versionNumber: workflowVersions.versionNumber })
					.from(workflowVersions)
					.where(eq(workflowVersions.workflowId, wf.id))
					.orderBy(desc(workflowVersions.versionNumber))
					.limit(1);
				const [version] = await tx
					.insert(workflowVersions)
					.values({
						workflowId: wf.id,
						organizationId,
						versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
						stateSnapshot: wf.draftState,
						validationSnapshot: validation,
						createdByUserId: ctx.session.user.id,
					})
					.returning();
				if (!version) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

				const [deployment] = await tx
					.insert(workflowDeployments)
					.values({
						workflowId: wf.id,
						workflowVersionId: version.id,
						organizationId,
						status: "active",
						deployedByUserId: ctx.session.user.id,
					})
					.returning();
				if (!deployment) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

				const [skill] = await tx
					.insert(skills)
					.values({
						organizationId,
						v2ProjectId: wf.v2ProjectId,
						ownerUserId: ctx.session.user.id,
						slug: input.slug,
						name: input.name,
						description: input.description ?? null,
						kind: "workflow",
						status: "published",
						visibility: input.visibility,
					})
					.returning();
				if (!skill) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

				const [skillVersion] = await tx
					.insert(skillVersions)
					.values({
						skillId: skill.id,
						organizationId,
						versionNumber: 1,
						inputSchema,
						outputSchema,
						workflowDeploymentId: deployment.id,
						runModes: input.runModes,
						createdByUserId: ctx.session.user.id,
					})
					.returning();
				if (!skillVersion)
					throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

				await tx
					.update(skills)
					.set({ currentVersionId: skillVersion.id })
					.where(eq(skills.id, skill.id));

				await tx.insert(skillBindings).values({
					organizationId,
					skillId: skill.id,
					surface: "workflow_node",
					enabled: true,
				});

				return {
					skill: { ...skill, currentVersionId: skillVersion.id },
					skillVersion,
				};
			});
		}),

	createInstructionSkill: protectedProcedure
		.input(createInstructionSkillSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return dbWs.transaction(async (tx) => {
				const [skill] = await tx
					.insert(skills)
					.values({
						organizationId,
						v2ProjectId: input.v2ProjectId ?? null,
						ownerUserId: ctx.session.user.id,
						slug: input.slug,
						name: input.name,
						description: input.description ?? null,
						kind: "instruction",
						status: "published",
						visibility: input.visibility,
					})
					.returning();
				if (!skill) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
				// Instruction skills are non-executable: empty schemas, no impl ref.
				const [version] = await tx
					.insert(skillVersions)
					.values({
						skillId: skill.id,
						organizationId,
						versionNumber: 1,
						inputSchema: {},
						outputSchema: {},
						documentationMd: input.documentationMd,
						runModes: [],
						createdByUserId: ctx.session.user.id,
					})
					.returning();
				if (!version) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
				await tx
					.update(skills)
					.set({ currentVersionId: version.id })
					.where(eq(skills.id, skill.id));
				return { skill, version };
			});
		}),

	createVersion: protectedProcedure
		.input(createSkillVersionSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const skill = await getSkillForOrg(organizationId, input.skillId);
			assertExactlyOneImplementationRef({
				workflowDeploymentId: input.workflowDeploymentId,
				legacyAutomationId: input.legacyAutomationId,
				simWorkflowExternalId: input.simWorkflowExternalId,
				externalToolRef: input.externalToolRef,
			});
			const [latest] = await db
				.select({ versionNumber: skillVersions.versionNumber })
				.from(skillVersions)
				.where(eq(skillVersions.skillId, skill.id))
				.orderBy(desc(skillVersions.versionNumber))
				.limit(1);
			const [version] = await db
				.insert(skillVersions)
				.values({
					skillId: skill.id,
					organizationId,
					versionNumber: (latest?.versionNumber ?? 0) + 1,
					inputSchema: input.inputSchema as JsonSchema,
					outputSchema: input.outputSchema as JsonSchema,
					workflowDeploymentId: input.workflowDeploymentId ?? null,
					legacyAutomationId: input.legacyAutomationId ?? null,
					simWorkflowExternalId: input.simWorkflowExternalId ?? null,
					externalToolRef: input.externalToolRef ?? null,
					documentationMd: input.documentationMd ?? null,
					runModes: input.runModes,
					createdByUserId: ctx.session.user.id,
				})
				.returning();
			return version;
		}),

	promoteVersion: protectedProcedure
		.input(promoteVersionSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const skill = await getSkillForOrg(organizationId, input.skillId);
			const [version] = await db
				.select({ id: skillVersions.id })
				.from(skillVersions)
				.where(
					and(
						eq(skillVersions.id, input.skillVersionId),
						eq(skillVersions.skillId, skill.id),
					),
				)
				.limit(1);
			if (!version) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Skill version not found for this skill",
				});
			}
			const [row] = await db
				.update(skills)
				.set({ currentVersionId: version.id })
				.where(eq(skills.id, skill.id))
				.returning();
			return row;
		}),

	deprecate: protectedProcedure
		.input(skillIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getSkillForOrg(organizationId, input.skillId);
			const [row] = await db
				.update(skills)
				.set({ status: "deprecated" })
				.where(eq(skills.id, input.skillId))
				.returning();
			return row;
		}),

	archive: protectedProcedure
		.input(skillIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getSkillForOrg(organizationId, input.skillId);
			const [row] = await db
				.update(skills)
				.set({ status: "archived" })
				.where(eq(skills.id, input.skillId))
				.returning();
			return row;
		}),

	getNodeDefinition: protectedProcedure
		.input(skillIdSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const skill = await getSkillForOrg(organizationId, input.skillId);
			const version = await getCurrentSkillVersion(
				skill.id,
				skill.currentVersionId,
			);
			return buildSkillNodeDefinition({
				slug: skill.slug,
				name: skill.name,
				inputSchema: version.inputSchema,
				outputSchema: version.outputSchema,
			});
		}),

	listNodeDefinitions: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		// Published skills exposed as workflow nodes.
		const rows = await db
			.select({
				slug: skills.slug,
				name: skills.name,
				inputSchema: skillVersions.inputSchema,
				outputSchema: skillVersions.outputSchema,
			})
			.from(skills)
			.innerJoin(skillVersions, eq(skills.currentVersionId, skillVersions.id))
			.innerJoin(skillBindings, eq(skillBindings.skillId, skills.id))
			.where(
				and(
					eq(skills.organizationId, organizationId),
					eq(skills.status, "published"),
					eq(skillBindings.surface, "workflow_node"),
					eq(skillBindings.enabled, true),
				),
			);
		return rows.map((r) =>
			buildSkillNodeDefinition({
				slug: r.slug,
				name: r.name,
				inputSchema: r.inputSchema,
				outputSchema: r.outputSchema,
			}),
		);
	}),

	bind: protectedProcedure
		.input(bindSkillSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getSkillForOrg(organizationId, input.skillId);
			const [row] = await db
				.insert(skillBindings)
				.values({
					organizationId,
					skillId: input.skillId,
					surface: input.surface,
					objectType: input.objectType ?? null,
					placement: input.placement ?? null,
					label: input.label ?? null,
					config: input.config ?? null,
					enabled: true,
				})
				.returning();
			return row;
		}),

	unbind: protectedProcedure
		.input(unbindSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await db
				.delete(skillBindings)
				.where(
					and(
						eq(skillBindings.id, input.bindingId),
						eq(skillBindings.organizationId, organizationId),
					),
				);
			return { ok: true };
		}),

	listBindings: protectedProcedure
		.input(listBindingsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [
				eq(skillBindings.organizationId, organizationId),
				eq(skillBindings.enabled, true),
			];
			if (input.skillId)
				conditions.push(eq(skillBindings.skillId, input.skillId));
			if (input.surface)
				conditions.push(eq(skillBindings.surface, input.surface));
			if (input.objectType) {
				// A binding with a null objectType matches any object type.
				const objectMatch = or(
					eq(skillBindings.objectType, input.objectType),
					isNull(skillBindings.objectType),
				);
				if (objectMatch) conditions.push(objectMatch);
			}
			return db
				.select()
				.from(skillBindings)
				.where(and(...conditions));
		}),

	validateRunInput: protectedProcedure
		.input(validateRunInputSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const skill = await getSkillForOrg(organizationId, input.skillId);
			const version = await getCurrentSkillVersion(
				skill.id,
				skill.currentVersionId,
			);
			const issues = validateInput(input.input, version.inputSchema);
			return { valid: issues.length === 0, issues };
		}),

	run: protectedProcedure
		.input(runSkillSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const result = await runSkill({
				organizationId,
				userId: ctx.session.user.id,
				skillId: input.skillId,
				runMode: input.runMode,
				triggerKind: "manual",
				input: input.input,
			});
			// A paused run records a pending approval the inbox can resolve.
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
		.input(listSkillRunsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getSkillForOrg(organizationId, input.skillId);
			return db
				.select()
				.from(workflowRuns)
				.where(
					and(
						eq(workflowRuns.organizationId, organizationId),
						eq(workflowRuns.skillId, input.skillId),
					),
				)
				.orderBy(desc(workflowRuns.createdAt))
				.limit(input.limit);
		}),
} satisfies TRPCRouterRecord;
