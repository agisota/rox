import { db } from "@rox/db/client";
import { invitations, users } from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";

export const organizationInvitationsRouter = {
	/**
	 * Lists pending invitations for the active organization. Desktop reads these
	 * from Electric-synced collections; web has no Electric, so this query backs
	 * the web pending-invitations list (Hermes-borrow F27 web parity).
	 */
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return db
			.select({
				id: invitations.id,
				email: invitations.email,
				role: invitations.role,
				status: invitations.status,
				expiresAt: invitations.expiresAt,
				createdAt: invitations.createdAt,
				inviterId: invitations.inviterId,
				inviterName: users.name,
			})
			.from(invitations)
			.leftJoin(users, eq(invitations.inviterId, users.id))
			.where(
				and(
					eq(invitations.organizationId, organizationId),
					eq(invitations.status, "pending"),
				),
			)
			.orderBy(desc(invitations.createdAt));
	}),
} satisfies TRPCRouterRecord;
