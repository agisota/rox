import { db } from "@rox/db/client";
import {
	agentPersonas,
	profileMcpServers,
	profileSkillAssignments,
	skills,
} from "@rox/db/schema";
import {
	BUILTIN_MCP_SERVER_LABEL,
	BUILTIN_MCP_SERVER_SLUG,
	BUILTIN_MCP_TOOLS,
	builtinMcpCategories,
} from "@rox/shared/mcp-catalog";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	assignMcpServerSchema,
	assignSkillSchema,
	mcpInventorySchema,
	personaIdSchema,
	removeMcpServerSchema,
	removeSkillSchema,
	setMcpServerEnabledSchema,
	setSkillEnabledSchema,
} from "./schema";

/**
 * Profile-scoped capability router (F47, #644).
 *
 * Two surfaces over one shared backend (the single core that web/desktop/mobile
 * all call):
 *   - `*Skill*` / `*McpServer*`: per-persona Skills + MCP grants, keyed by
 *     `personaId` and re-scoped to the caller's active org on every call.
 *   - `mcpInventory`: a read-only, secret-free inventory of MCP servers/tools
 *     with `enabled/total` coverage and a searchable tool list.
 *
 * Security: the inventory source (`@rox/mcp-v2` catalog) carries no credential
 * fields, so nothing here can leak a token — the redaction is structural (we
 * never read a server's secret config). Org isolation rides on
 * `requireActiveOrgMembership` plus a per-persona same-org check.
 */

/** Resolve a persona that exists in the caller's active org (or 404). */
async function getPersonaInOrg(organizationId: string, personaId: string) {
	const [row] = await db
		.select()
		.from(agentPersonas)
		.where(
			and(
				eq(agentPersonas.id, personaId),
				eq(agentPersonas.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found" });
	}
	return row;
}

/** Verify a skill exists in the active org (prevents cross-org grants). */
async function assertSkillInOrg(organizationId: string, skillId: string) {
	const [row] = await db
		.select({ id: skills.id })
		.from(skills)
		.where(
			and(eq(skills.id, skillId), eq(skills.organizationId, organizationId)),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });
	}
}

export const profileCapabilitiesRouter = {
	// -------------------------------------------------------------------------
	// Skills
	// -------------------------------------------------------------------------

	/** Skill assignments for a persona (the persona's skill capability set). */
	listSkills: protectedProcedure
		.input(personaIdSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPersonaInOrg(organizationId, input.personaId);
			const rows = await db
				.select({
					skillId: skills.id,
					slug: skills.slug,
					name: skills.name,
					description: skills.description,
					kind: skills.kind,
					category: skills.category,
					enabled: profileSkillAssignments.enabled,
				})
				.from(profileSkillAssignments)
				.innerJoin(skills, eq(profileSkillAssignments.skillId, skills.id))
				.where(
					and(
						eq(profileSkillAssignments.personaId, input.personaId),
						eq(profileSkillAssignments.organizationId, organizationId),
					),
				)
				.orderBy(asc(skills.name));
			return rows;
		}),

	/** Coverage summary (enabled/total) for a persona's skill set. */
	skillCoverage: protectedProcedure
		.input(personaIdSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPersonaInOrg(organizationId, input.personaId);
			const rows = await db
				.select({ enabled: profileSkillAssignments.enabled })
				.from(profileSkillAssignments)
				.where(
					and(
						eq(profileSkillAssignments.personaId, input.personaId),
						eq(profileSkillAssignments.organizationId, organizationId),
					),
				);
			return {
				total: rows.length,
				enabled: rows.filter((r) => r.enabled).length,
			};
		}),

	assignSkill: protectedProcedure
		.input(assignSkillSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPersonaInOrg(organizationId, input.personaId);
			await assertSkillInOrg(organizationId, input.skillId);
			const [row] = await db
				.insert(profileSkillAssignments)
				.values({
					personaId: input.personaId,
					skillId: input.skillId,
					organizationId,
					enabled: input.enabled ?? true,
					assignedByUserId: ctx.session.user.id,
				})
				.onConflictDoUpdate({
					target: [
						profileSkillAssignments.personaId,
						profileSkillAssignments.skillId,
					],
					set: { enabled: input.enabled ?? true },
				})
				.returning();
			return row;
		}),

	setSkillEnabled: protectedProcedure
		.input(setSkillEnabledSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPersonaInOrg(organizationId, input.personaId);
			const [row] = await db
				.update(profileSkillAssignments)
				.set({ enabled: input.enabled })
				.where(
					and(
						eq(profileSkillAssignments.personaId, input.personaId),
						eq(profileSkillAssignments.skillId, input.skillId),
						eq(profileSkillAssignments.organizationId, organizationId),
					),
				)
				.returning();
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Skill assignment not found",
				});
			}
			return row;
		}),

	removeSkill: protectedProcedure
		.input(removeSkillSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPersonaInOrg(organizationId, input.personaId);
			await db
				.delete(profileSkillAssignments)
				.where(
					and(
						eq(profileSkillAssignments.personaId, input.personaId),
						eq(profileSkillAssignments.skillId, input.skillId),
						eq(profileSkillAssignments.organizationId, organizationId),
					),
				);
			return { ok: true };
		}),

	// -------------------------------------------------------------------------
	// MCP servers (per-persona grants)
	// -------------------------------------------------------------------------

	listMcpServers: protectedProcedure
		.input(personaIdSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPersonaInOrg(organizationId, input.personaId);
			return db
				.select({
					serverSlug: profileMcpServers.serverSlug,
					enabled: profileMcpServers.enabled,
				})
				.from(profileMcpServers)
				.where(
					and(
						eq(profileMcpServers.personaId, input.personaId),
						eq(profileMcpServers.organizationId, organizationId),
					),
				)
				.orderBy(asc(profileMcpServers.serverSlug));
		}),

	assignMcpServer: protectedProcedure
		.input(assignMcpServerSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPersonaInOrg(organizationId, input.personaId);
			const [row] = await db
				.insert(profileMcpServers)
				.values({
					personaId: input.personaId,
					serverSlug: input.serverSlug,
					organizationId,
					enabled: input.enabled ?? true,
					assignedByUserId: ctx.session.user.id,
				})
				.onConflictDoUpdate({
					target: [profileMcpServers.personaId, profileMcpServers.serverSlug],
					set: { enabled: input.enabled ?? true },
				})
				.returning();
			return row;
		}),

	setMcpServerEnabled: protectedProcedure
		.input(setMcpServerEnabledSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPersonaInOrg(organizationId, input.personaId);
			const [row] = await db
				.update(profileMcpServers)
				.set({ enabled: input.enabled })
				.where(
					and(
						eq(profileMcpServers.personaId, input.personaId),
						eq(profileMcpServers.serverSlug, input.serverSlug),
						eq(profileMcpServers.organizationId, organizationId),
					),
				)
				.returning();
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "MCP server assignment not found",
				});
			}
			return row;
		}),

	removeMcpServer: protectedProcedure
		.input(removeMcpServerSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getPersonaInOrg(organizationId, input.personaId);
			await db
				.delete(profileMcpServers)
				.where(
					and(
						eq(profileMcpServers.personaId, input.personaId),
						eq(profileMcpServers.serverSlug, input.serverSlug),
						eq(profileMcpServers.organizationId, organizationId),
					),
				);
			return { ok: true };
		}),

	// -------------------------------------------------------------------------
	// MCP inventory (read-only, secret-free)
	// -------------------------------------------------------------------------

	/**
	 * MCP inventory: servers + tools with categories, `enabled/total` coverage
	 * and a searchable tool list. When `personaId` is supplied, coverage and the
	 * server `enabled` flag reflect that persona's grants. No secret value is
	 * ever read or returned — the catalog is a name/description/category triple.
	 */
	mcpInventory: protectedProcedure
		.input(mcpInventorySchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			// Per-persona lens: which servers this persona has enabled.
			const grantBySlug = new Map<string, boolean>();
			if (input?.personaId) {
				await getPersonaInOrg(organizationId, input.personaId);
				const grants = await db
					.select({
						serverSlug: profileMcpServers.serverSlug,
						enabled: profileMcpServers.enabled,
					})
					.from(profileMcpServers)
					.where(
						and(
							eq(profileMcpServers.personaId, input.personaId),
							eq(profileMcpServers.organizationId, organizationId),
						),
					);
				for (const g of grants) {
					grantBySlug.set(g.serverSlug, g.enabled);
				}
			}

			const search = input?.search?.toLowerCase();
			const categoryFilter = input?.category;

			const tools = BUILTIN_MCP_TOOLS.filter((t) => {
				if (categoryFilter && t.category !== categoryFilter) {
					return false;
				}
				if (search) {
					const haystack = `${t.name} ${t.description}`.toLowerCase();
					if (!haystack.includes(search)) {
						return false;
					}
				}
				return true;
			}).map((t) => ({
				name: t.name,
				description: t.description,
				category: t.category,
				serverSlug: BUILTIN_MCP_SERVER_SLUG,
			}));

			// Built-in server "enabled" = persona grant when a lens is set; the
			// built-in server is always available (total) regardless.
			const builtinEnabled = input?.personaId
				? (grantBySlug.get(BUILTIN_MCP_SERVER_SLUG) ?? false)
				: true;

			const servers = [
				{
					slug: BUILTIN_MCP_SERVER_SLUG,
					label: BUILTIN_MCP_SERVER_LABEL,
					toolCount: BUILTIN_MCP_TOOLS.length,
					enabled: builtinEnabled,
				},
			];

			return {
				categories: builtinMcpCategories(),
				servers,
				tools,
				coverage: {
					total: servers.length,
					enabled: servers.filter((s) => s.enabled).length,
				},
			};
		}),
} satisfies TRPCRouterRecord;
