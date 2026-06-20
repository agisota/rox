import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { env } from "../../../env";
import { protectedProcedure } from "../../../trpc";
import { createProviderConnectionRouter } from "../shared/provider-router";
import { verifyOrgMembership } from "../utils";

/**
 * PARKED (WS-O §1.1): half-wired. The interactions route verifies the Ed25519
 * signature and 200-ACKs, but the agent dispatch is still
 * `TODO(discord PR-2)` (`apps/api/.../integrations/discord/interactions/route.ts`).
 * Follow-up: PR-2 enqueues the run-agent job. Do NOT remove the `discord`
 * provider enum value — provider removal is out of scope.
 */

// Single Rox Discord app serves every guild, so the interactions endpoint is one
// fixed URL (Discord's "Interactions Endpoint URL" in the app settings) rather
// than a per-connection value. Exposed as a read-only helper for the setup UI.
const DISCORD_INTERACTIONS_PATH = "/api/integrations/discord/interactions";

export const discordRouter = {
	// Generic connect/disconnect/getConnection/testConnection baseline.
	...createProviderConnectionRouter("discord"),

	// Read-only: the interactions endpoint URL to paste into the Discord app.
	getInteractionsEndpoint: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			return {
				endpoint: `${env.NEXT_PUBLIC_API_URL}${DISCORD_INTERACTIONS_PATH}`,
			};
		}),
} satisfies TRPCRouterRecord;
