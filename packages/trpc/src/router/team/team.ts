import { db } from "@rox/db/client";
import { teams } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin } from "../integration/utils";
import {
	requireActiveOrgId,
	requireActiveOrgMembership,
} from "../utils/active-org";

async function requireTeamInActiveOrg(teamId: string, organizationId: string) {
	const team = await db.query.teams.findFirst({
		where: and(eq(teams.id, teamId), eq(teams.organizationId, organizationId)),
		columns: { id: true },
	});
	if (!team) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Team not found in this organization",
		});
	}
}

export const teamRouter = {
	/**
	 * Lists teams in the active organization. Desktop reads teams from
	 * Electric-synced collections; web has no Electric, so this query gives the
	 * web teams panel the same data over tRPC (Hermes-borrow F27).
	 */
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return db
			.select({
				id: teams.id,
				name: teams.name,
				slug: teams.slug,
				organizationId: teams.organizationId,
				createdAt: teams.createdAt,
				updatedAt: teams.updatedAt,
			})
			.from(teams)
			.where(eq(teams.organizationId, organizationId))
			.orderBy(asc(teams.createdAt));
	}),

	addMember: protectedProcedure
		.input(
			z.object({
				teamId: z.string().uuid(),
				userId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			await verifyOrgAdmin(ctx.session.user.id, organizationId);
			await requireTeamInActiveOrg(input.teamId, organizationId);

			await ctx.auth.api.addTeamMember({
				body: { teamId: input.teamId, userId: input.userId },
				headers: ctx.headers,
			});
			return { success: true };
		}),

	removeMember: protectedProcedure
		.input(
			z.object({
				teamId: z.string().uuid(),
				userId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			const isSelf = input.userId === ctx.session.user.id;
			if (!isSelf) {
				await verifyOrgAdmin(ctx.session.user.id, organizationId);
			}
			await requireTeamInActiveOrg(input.teamId, organizationId);

			// The ≥1-team invariant is enforced by the beforeRemoveTeamMember
			// org hook, so any caller (this procedure, direct authClient, future
			// API surfaces) gets the same guarantee.
			await ctx.auth.api.removeTeamMember({
				body: { teamId: input.teamId, userId: input.userId },
				headers: ctx.headers,
			});
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
