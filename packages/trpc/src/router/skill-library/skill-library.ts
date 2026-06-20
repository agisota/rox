import { db } from "@rox/db/client";
import {
	skillLibraries,
	skillLibraryItems,
	skillLibraryTeamAssignments,
	skills,
} from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	addLibraryItemSchema,
	assignTeamSchema,
	createLibrarySchema,
	libraryIdSchema,
	listLibrariesSchema,
	removeLibraryItemSchema,
	unassignTeamSchema,
	updateLibrarySchema,
} from "./schema";

/**
 * Org skill-library router (WS-J §2.2 P1, T2).
 *
 * Every procedure is org-scoped via `requireActiveOrgMembership` (the skill
 * router pattern, NOT agentSource verifyOrgMembership) and constrains all
 * statements by `organizationId`, so an org can never read or mutate another
 * org's libraries. Membership join rows denormalize `organization_id` for
 * ElectricSQL shape filtering (the `team_members` pattern the schema documents).
 */

async function getLibraryForOrg(organizationId: string, libraryId: string) {
	const [row] = await db
		.select()
		.from(skillLibraries)
		.where(
			and(
				eq(skillLibraries.id, libraryId),
				eq(skillLibraries.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Skill library not found",
		});
	}
	return row;
}

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

export const skillLibraryRouter = {
	list: protectedProcedure
		.input(listLibrariesSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [eq(skillLibraries.organizationId, organizationId)];
			if (input?.v2ProjectId) {
				conditions.push(eq(skillLibraries.v2ProjectId, input.v2ProjectId));
			}
			return db
				.select()
				.from(skillLibraries)
				.where(and(...conditions))
				.orderBy(desc(skillLibraries.updatedAt));
		}),

	get: protectedProcedure
		.input(libraryIdSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const library = await getLibraryForOrg(organizationId, input.libraryId);
			const items = await db
				.select()
				.from(skillLibraryItems)
				.where(eq(skillLibraryItems.libraryId, library.id))
				.orderBy(asc(skillLibraryItems.position));
			const teamAssignments = await db
				.select()
				.from(skillLibraryTeamAssignments)
				.where(eq(skillLibraryTeamAssignments.libraryId, library.id));
			return { library, items, teamAssignments };
		}),

	create: protectedProcedure
		.input(createLibrarySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [row] = await db
				.insert(skillLibraries)
				.values({
					organizationId,
					v2ProjectId: input.v2ProjectId ?? null,
					slug: input.slug,
					name: input.name,
					description: input.description ?? null,
					createdByUserId: ctx.session.user.id,
				})
				.returning();
			return row;
		}),

	update: protectedProcedure
		.input(updateLibrarySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getLibraryForOrg(organizationId, input.libraryId);
			const [row] = await db
				.update(skillLibraries)
				.set({
					...(input.name !== undefined ? { name: input.name } : {}),
					...(input.description !== undefined
						? { description: input.description }
						: {}),
				})
				.where(
					and(
						eq(skillLibraries.id, input.libraryId),
						eq(skillLibraries.organizationId, organizationId),
					),
				)
				.returning();
			return row;
		}),

	delete: protectedProcedure
		.input(libraryIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getLibraryForOrg(organizationId, input.libraryId);
			await db
				.delete(skillLibraries)
				.where(
					and(
						eq(skillLibraries.id, input.libraryId),
						eq(skillLibraries.organizationId, organizationId),
					),
				);
			return { ok: true as const };
		}),

	addItem: protectedProcedure
		.input(addLibraryItemSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getLibraryForOrg(organizationId, input.libraryId);
			await assertSkillInOrg(organizationId, input.skillId);
			const [row] = await db
				.insert(skillLibraryItems)
				.values({
					libraryId: input.libraryId,
					skillId: input.skillId,
					organizationId,
					position: input.position ?? 0,
				})
				.returning();
			return row;
		}),

	removeItem: protectedProcedure
		.input(removeLibraryItemSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getLibraryForOrg(organizationId, input.libraryId);
			await db
				.delete(skillLibraryItems)
				.where(
					and(
						eq(skillLibraryItems.libraryId, input.libraryId),
						eq(skillLibraryItems.skillId, input.skillId),
						eq(skillLibraryItems.organizationId, organizationId),
					),
				);
			return { ok: true as const };
		}),

	assignTeam: protectedProcedure
		.input(assignTeamSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getLibraryForOrg(organizationId, input.libraryId);
			const [row] = await db
				.insert(skillLibraryTeamAssignments)
				.values({
					libraryId: input.libraryId,
					teamId: input.teamId,
					organizationId,
				})
				.returning();
			return row;
		}),

	unassignTeam: protectedProcedure
		.input(unassignTeamSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getLibraryForOrg(organizationId, input.libraryId);
			await db
				.delete(skillLibraryTeamAssignments)
				.where(
					and(
						eq(skillLibraryTeamAssignments.libraryId, input.libraryId),
						eq(skillLibraryTeamAssignments.teamId, input.teamId),
						eq(skillLibraryTeamAssignments.organizationId, organizationId),
					),
				);
			return { ok: true as const };
		}),
} satisfies TRPCRouterRecord;
