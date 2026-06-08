import { db, dbWs } from "@rox/db/client";
import {
	accessGranteeTypeEnum,
	accessGrants,
	accessResourceTypeEnum,
	accessRoleEnum,
} from "@rox/db/schema";
import { getCurrentTxid } from "@rox/db/utils";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin } from "../integration/utils";
import { requireActiveOrgMembership } from "../utils/active-org";

const grantInput = z.object({
	resourceType: accessResourceTypeEnum,
	resourceId: z.string().uuid(),
	granteeType: accessGranteeTypeEnum,
	granteeId: z.string().uuid(),
	role: accessRoleEnum,
});

export const shareRouter = {
	/**
	 * Grant (or update) a role on a resource for a user, team, or the whole org.
	 * Upserts on the unique (org, resourceType, resourceId, granteeType,
	 * granteeId) tuple so re-sharing simply changes the role. Returns the row id
	 * plus an Electric `txid` for write-sync.
	 */
	grant: protectedProcedure
		.input(grantInput)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await verifyOrgAdmin(ctx.session.user.id, organizationId);

			const result = await dbWs.transaction(async (tx) => {
				const [row] = await tx
					.insert(accessGrants)
					.values({
						organizationId,
						resourceType: input.resourceType,
						resourceId: input.resourceId,
						granteeType: input.granteeType,
						granteeId: input.granteeId,
						role: input.role,
						createdByUserId: ctx.session.user.id,
					})
					.onConflictDoUpdate({
						target: [
							accessGrants.organizationId,
							accessGrants.resourceType,
							accessGrants.resourceId,
							accessGrants.granteeType,
							accessGrants.granteeId,
						],
						set: { role: input.role },
					})
					.returning({ id: accessGrants.id });

				const txid = await getCurrentTxid(tx);
				return { id: row?.id, txid };
			});

			if (!result.id) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create access grant",
				});
			}

			return { id: result.id, txid: result.txid };
		}),

	/**
	 * Revoke an existing grant by id. Scoped to the active org so callers can
	 * only revoke grants they can see.
	 */
	revoke: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await verifyOrgAdmin(ctx.session.user.id, organizationId);

			const result = await dbWs.transaction(async (tx) => {
				const [row] = await tx
					.delete(accessGrants)
					.where(
						and(
							eq(accessGrants.id, input.id),
							eq(accessGrants.organizationId, organizationId),
						),
					)
					.returning({ id: accessGrants.id });

				if (!row) {
					return { deleted: false, txid: null };
				}

				const txid = await getCurrentTxid(tx);
				return { deleted: true, txid };
			});

			if (!result.deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Access grant not found in this organization",
				});
			}

			return { success: true, txid: result.txid };
		}),

	/**
	 * List access grants for the active org, optionally filtered to a single
	 * resource. Any org member may read the grant list.
	 */
	list: protectedProcedure
		.input(
			z
				.object({
					resourceType: accessResourceTypeEnum.optional(),
					resourceId: z.string().uuid().optional(),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const filters = [eq(accessGrants.organizationId, organizationId)];
			if (input?.resourceType) {
				filters.push(eq(accessGrants.resourceType, input.resourceType));
			}
			if (input?.resourceId) {
				filters.push(eq(accessGrants.resourceId, input.resourceId));
			}

			return db.query.accessGrants.findMany({
				where: and(...filters),
				orderBy: desc(accessGrants.createdAt),
			});
		}),
} satisfies TRPCRouterRecord;
