import { db } from "@rox/db/client";
import type { IntegrationProvider } from "@rox/db/schema";
import { integrationConnections } from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";

/**
 * Builds the standard connection router for an integration provider:
 * `getConnection` (member) + `disconnect` (admin). Connections are org-scoped
 * with optional per-workspace scoping (`workspaceId`); omitting `workspaceId`
 * targets the org-level connection.
 *
 * Mirrors the hand-written Slack/Linear routers so each provider vertical only
 * adds provider-specific procedures on top of this baseline.
 */
export function createProviderConnectionRouter(
	provider: IntegrationProvider,
): TRPCRouterRecord {
	const scope = z.object({
		organizationId: z.uuid(),
		workspaceId: z.uuid().nullish(),
	});

	const workspaceFilter = (workspaceId: string | null | undefined) =>
		workspaceId
			? eq(integrationConnections.workspaceId, workspaceId)
			: isNull(integrationConnections.workspaceId);

	return {
		getConnection: protectedProcedure
			.input(scope)
			.query(async ({ ctx, input }) => {
				await verifyOrgMembership(ctx.session.user.id, input.organizationId);

				const connection = await db.query.integrationConnections.findFirst({
					where: and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, provider),
						workspaceFilter(input.workspaceId),
					),
					columns: {
						id: true,
						externalOrgName: true,
						config: true,
						createdAt: true,
					},
				});

				if (!connection) return null;

				return {
					id: connection.id,
					externalOrgName: connection.externalOrgName,
					config: connection.config,
					connectedAt: connection.createdAt,
				};
			}),

		disconnect: protectedProcedure
			.input(scope)
			.mutation(async ({ ctx, input }) => {
				await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

				const result = await db
					.delete(integrationConnections)
					.where(
						and(
							eq(integrationConnections.organizationId, input.organizationId),
							eq(integrationConnections.provider, provider),
							workspaceFilter(input.workspaceId),
						),
					)
					.returning({ id: integrationConnections.id });

				if (result.length === 0) {
					return { success: false as const, error: "No connection found" };
				}

				return { success: true as const };
			}),
	} satisfies TRPCRouterRecord;
}
