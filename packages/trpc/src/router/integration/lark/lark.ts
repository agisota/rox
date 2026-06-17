import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { env } from "../../../env";
import { protectedProcedure } from "../../../trpc";
import { createProviderConnectionRouter } from "../shared/provider-router";
import { verifyOrgMembership } from "../utils";

export const larkRouter = {
	// Baseline getConnection / testConnection / connect / disconnect.
	...createProviderConnectionRouter("lark"),

	/**
	 * Read-only helper returning the inbound event-subscription URL to paste into
	 * the Lark Developer Console. Org-scoped membership check mirrors the other
	 * member-readable procedures in the provider router.
	 */
	getEventEndpoint: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			return {
				url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/lark/events`,
			};
		}),
} satisfies TRPCRouterRecord;
