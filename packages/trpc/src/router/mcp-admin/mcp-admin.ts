import { db } from "@rox/db/client";
import { skillBindings, skills, skillVersions } from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { listExposedSkillsSchema } from "./schema";

/**
 * MCP admin introspection router (WS-J §2.2 P1, T6).
 *
 * Read-only view of what the active org exposes over the v2 MCP surface: the
 * skills bound with `surface = "mcp"`. Org-scoped via `requireActiveOrgMembership`
 * (the skill router pattern, NOT agentSource verifyOrgMembership); every query is
 * constrained by `organizationId` so one org can never introspect another's MCP
 * exposure. No mutations — binding/unbinding stays on the `skill` router.
 */

export const mcpAdminRouter = {
	listExposedSkills: protectedProcedure
		.input(listExposedSkillsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [
				eq(skillBindings.organizationId, organizationId),
				eq(skillBindings.surface, "mcp"),
			];
			if (input?.enabledOnly) {
				conditions.push(eq(skillBindings.enabled, true));
			}
			const rows = await db
				.select({
					bindingId: skillBindings.id,
					skillId: skills.id,
					slug: skills.slug,
					name: skills.name,
					description: skills.description,
					kind: skills.kind,
					status: skills.status,
					enabled: skillBindings.enabled,
					label: skillBindings.label,
					inputSchema: skillVersions.inputSchema,
					outputSchema: skillVersions.outputSchema,
				})
				.from(skillBindings)
				.innerJoin(skills, eq(skillBindings.skillId, skills.id))
				.leftJoin(skillVersions, eq(skills.currentVersionId, skillVersions.id))
				.where(and(...conditions));
			return rows.map((r) => ({ ...r, surface: "mcp" as const }));
		}),

	summary: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const rows = await db
			.select({
				skillId: skillBindings.skillId,
				enabled: skillBindings.enabled,
			})
			.from(skillBindings)
			.where(
				and(
					eq(skillBindings.organizationId, organizationId),
					eq(skillBindings.surface, "mcp"),
				),
			);
		const distinct = new Set(rows.map((r) => r.skillId));
		return {
			totalBindings: rows.length,
			enabledBindings: rows.filter((r) => r.enabled).length,
			distinctSkills: distinct.size,
		};
	}),
} satisfies TRPCRouterRecord;
