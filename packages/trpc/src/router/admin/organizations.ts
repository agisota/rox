import { auth } from "@rox/auth/server";
import { db } from "@rox/db/client";
import { members, organizations, teamMembers } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";

import { adminProcedure } from "../../trpc";
import {
	addMemberSchema,
	createOrganizationSchema,
	organizationIdSchema,
	removeMemberSchema,
	renameOrganizationSchema,
} from "./schema";

export const adminOrganizationsRouter = {
	listOrganizations: adminProcedure.query(async () => {
		const orgs = await db.query.organizations.findMany({
			orderBy: desc(organizations.createdAt),
			columns: { id: true, name: true, slug: true, createdAt: true },
			with: {
				members: {
					columns: { id: true, role: true, createdAt: true },
					with: {
						user: {
							columns: { id: true, name: true, email: true, image: true },
						},
					},
				},
			},
		});

		return orgs.map((org) => ({
			id: org.id,
			name: org.name,
			slug: org.slug,
			createdAt: org.createdAt,
			memberCount: org.members.length,
			members: org.members.map((m) => ({
				memberId: m.id,
				role: m.role,
				userId: m.user.id,
				name: m.user.name,
				email: m.user.email,
				image: m.user.image,
			})),
		}));
	}),

	createOrganization: adminProcedure
		.input(createOrganizationSchema)
		.mutation(async ({ ctx, input }) => {
			const existing = await db.query.organizations.findFirst({
				where: eq(organizations.slug, input.slug),
				columns: { id: true },
			});
			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "An organization with that slug already exists.",
				});
			}

			// Use Better Auth so the default-team + default-status hooks run,
			// preserving the "every member belongs to >=1 team" invariant. The
			// acting admin is recorded as the creator/owner.
			const org = await auth.api.createOrganization({
				body: {
					name: input.name,
					slug: input.slug,
					userId: ctx.session.user.id,
				},
			});
			if (!org) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create organization.",
				});
			}

			return { organizationId: org.id };
		}),

	renameOrganization: adminProcedure
		.input(renameOrganizationSchema)
		.mutation(async ({ input }) => {
			await db
				.update(organizations)
				.set({ name: input.name })
				.where(eq(organizations.id, input.organizationId));
			return { success: true };
		}),

	deleteOrganization: adminProcedure
		.input(organizationIdSchema)
		.mutation(async ({ input }) => {
			// FK cascades clear members, teams, team_members and invitations.
			await db
				.delete(organizations)
				.where(eq(organizations.id, input.organizationId));
			return { success: true };
		}),

	addMember: adminProcedure
		.input(addMemberSchema)
		.mutation(async ({ input }) => {
			const already = await db.query.members.findFirst({
				where: and(
					eq(members.organizationId, input.organizationId),
					eq(members.userId, input.userId),
				),
				columns: { id: true },
			});
			if (already) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "User is already a member of this organization.",
				});
			}

			// auth.api.addMember runs the afterAddMember hook (default-team
			// enrollment) and accepts an explicit userId without session headers.
			await auth.api.addMember({
				body: {
					organizationId: input.organizationId,
					userId: input.userId,
					role: input.role,
				},
			});
			return { success: true };
		}),

	removeMember: adminProcedure
		.input(removeMemberSchema)
		.mutation(async ({ input }) => {
			// Cross-org admin removal can't go through auth.api.removeMember (it
			// requires the caller to be a member with permission). Remove the
			// membership directly and mirror the org plugin's beforeRemoveMember
			// hook by clearing this user's team_members rows in the org so no
			// orphaned team membership is left behind.
			await db
				.delete(teamMembers)
				.where(
					and(
						eq(teamMembers.userId, input.userId),
						eq(teamMembers.organizationId, input.organizationId),
					),
				);
			await db
				.delete(members)
				.where(
					and(
						eq(members.organizationId, input.organizationId),
						eq(members.userId, input.userId),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
