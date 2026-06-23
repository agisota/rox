import { db, dbWs } from "@rox/db/client";
import { skillBindings, skills, skillVersions } from "@rox/db/schema";
import type { AgentRolePreset } from "@rox/workflow-core";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { getAgentRoleForOrg } from "./access";
import { listAgentRoles, seedBuiltinRoles } from "./roles";
import {
	agentRoleIdSchema,
	createAgentRoleSchema,
	listAgentRolesSchema,
	seedBuiltinRolesSchema,
	updateAgentRoleSchema,
} from "./schema";

/**
 * agentRoleRouter — CRUD for agent-role preset bundles, plus seed/read of the
 * four built-in role templates (prompt-improver, decomposer, orchestrator,
 * critic).
 *
 * A "role" is a saved preset bundle (system prompt + model + skills + settings)
 * modeled as a `skills(kind="agent")` row whose current `skill_versions.agentConfig`
 * carries the {@link AgentRolePreset}. We reuse the skills tables verbatim — no
 * new role table. Editing a role publishes a new immutable version.
 */
export const agentRoleRouter = {
	/** List the org's agent roles (with their current preset), optional project scope. */
	list: protectedProcedure
		.input(listAgentRolesSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return listAgentRoles(organizationId, input?.v2ProjectId);
		}),

	get: protectedProcedure
		.input(agentRoleIdSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const skill = await getAgentRoleForOrg(organizationId, input.roleSkillId);
			let preset: AgentRolePreset | null = null;
			if (skill.currentVersionId) {
				const [version] = await db
					.select({ agentConfig: skillVersions.agentConfig })
					.from(skillVersions)
					.where(eq(skillVersions.id, skill.currentVersionId))
					.limit(1);
				preset = version?.agentConfig ?? null;
			}
			return { skill, preset };
		}),

	/**
	 * Create a new agent role: a `skills(kind="agent")` row + version 1 carrying
	 * the preset bundle in `agentConfig` (the impl ref for agent roles). Bound to
	 * the `agent_tool` surface so the canvas role palette can list it.
	 */
	create: protectedProcedure
		.input(createAgentRoleSchema)
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
						kind: "agent",
						status: "published",
						visibility: "organization",
					})
					.returning();
				if (!skill) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
				const [version] = await tx
					.insert(skillVersions)
					.values({
						skillId: skill.id,
						organizationId,
						versionNumber: 1,
						inputSchema: {},
						outputSchema: {},
						// agentConfig IS the implementation ref for kind="agent".
						agentConfig: input.preset as AgentRolePreset,
						runModes: ["workflow_node"],
						createdByUserId: ctx.session.user.id,
					})
					.returning();
				if (!version) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
				await tx
					.update(skills)
					.set({ currentVersionId: version.id })
					.where(eq(skills.id, skill.id));
				await tx.insert(skillBindings).values({
					organizationId,
					skillId: skill.id,
					surface: "agent_tool",
					enabled: true,
				});
				return { skill: { ...skill, currentVersionId: version.id }, version };
			});
		}),

	/**
	 * Update an agent role. Name/description patch the skill row in place;
	 * supplying `preset` publishes a NEW immutable version and promotes it (the
	 * preset bundle is versioned, like any skill implementation).
	 */
	update: protectedProcedure
		.input(updateAgentRoleSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const skill = await getAgentRoleForOrg(organizationId, input.roleSkillId);

			return dbWs.transaction(async (tx) => {
				if (input.name !== undefined || input.description !== undefined) {
					await tx
						.update(skills)
						.set({
							name: input.name ?? skill.name,
							description:
								input.description === undefined
									? skill.description
									: input.description,
						})
						.where(eq(skills.id, skill.id));
				}

				let currentVersionId = skill.currentVersionId;
				if (input.preset) {
					const [latest] = await tx
						.select({ versionNumber: skillVersions.versionNumber })
						.from(skillVersions)
						.where(eq(skillVersions.skillId, skill.id))
						.orderBy(desc(skillVersions.versionNumber))
						.limit(1);
					const [version] = await tx
						.insert(skillVersions)
						.values({
							skillId: skill.id,
							organizationId,
							versionNumber: (latest?.versionNumber ?? 0) + 1,
							inputSchema: {},
							outputSchema: {},
							agentConfig: input.preset as AgentRolePreset,
							runModes: ["workflow_node"],
							createdByUserId: ctx.session.user.id,
						})
						.returning();
					if (!version) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
					await tx
						.update(skills)
						.set({ currentVersionId: version.id })
						.where(eq(skills.id, skill.id));
					currentVersionId = version.id;
				}

				const [row] = await tx
					.select()
					.from(skills)
					.where(eq(skills.id, skill.id))
					.limit(1);
				return { skill: row, currentVersionId };
			});
		}),

	archive: protectedProcedure
		.input(agentRoleIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getAgentRoleForOrg(organizationId, input.roleSkillId);
			const [row] = await db
				.update(skills)
				.set({ status: "archived" })
				.where(eq(skills.id, input.roleSkillId))
				.returning();
			return row;
		}),

	/**
	 * Seed the four built-in role templates (prompt-improver, decomposer,
	 * orchestrator, critic) for the org (and optional project scope). Idempotent:
	 * existing roles in the same scope are left untouched. Returns all built-in
	 * roles after seeding.
	 */
	seedBuiltins: protectedProcedure
		.input(seedBuiltinRolesSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return seedBuiltinRoles(
				organizationId,
				ctx.session.user.id,
				input?.v2ProjectId ?? null,
			);
		}),
} satisfies TRPCRouterRecord;
