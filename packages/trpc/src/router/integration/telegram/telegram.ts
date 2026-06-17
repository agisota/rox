import { randomBytes } from "node:crypto";
import { db } from "@rox/db/client";
import type { TelegramConfig } from "@rox/db/schema";
import { integrationConnections } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { decodeSecret } from "../../../lib/integrations/secret-store";
import { protectedProcedure } from "../../../trpc";
import { createProviderConnectionRouter } from "../shared/provider-router";
import { verifyOrgAdmin } from "../utils";

/** `setWebhook` response envelope (subset). */
type SetWebhookResponse = { ok: boolean; description?: string };

/**
 * Registers the Telegram webhook for the org's stored bot connection.
 *
 * Telegram has no request signing, so we generate a per-connection
 * `webhookSecret`, register it via `setWebhook({ secret_token })`, and persist it
 * in the connection's jsonb `config`. Telegram echoes that secret back on every
 * update via `X-Telegram-Bot-Api-Secret-Token`, which the inbound webhook uses to
 * resolve the originating org.
 */
async function callSetWebhook(
	botToken: string,
	url: string,
	secretToken: string,
): Promise<void> {
	let response: Response;
	try {
		response = await fetch(
			`https://api.telegram.org/bot${botToken}/setWebhook`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url, secret_token: secretToken }),
			},
		);
	} catch (cause) {
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: "Failed to reach Telegram setWebhook",
			cause,
		});
	}

	let parsed: SetWebhookResponse;
	try {
		parsed = (await response.json()) as SetWebhookResponse;
	} catch (cause) {
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: "Telegram setWebhook returned a non-JSON response",
			cause,
		});
	}

	if (!parsed.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Telegram setWebhook failed: ${parsed.description ?? "unknown error"}`,
		});
	}
}

export const telegramRouter = {
	...createProviderConnectionRouter("telegram"),

	/**
	 * Generates a fresh per-connection secret, registers the webhook with Telegram,
	 * and persists the secret into `config.webhookSecret` for inbound matching.
	 */
	registerWebhook: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				workspaceId: z.uuid().nullish(),
				webhookUrl: z.url(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "telegram"),
					input.workspaceId
						? eq(integrationConnections.workspaceId, input.workspaceId)
						: isNull(integrationConnections.workspaceId),
				),
			});

			if (!connection) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Connect a Telegram bot token before registering a webhook",
				});
			}

			const botToken = decodeSecret(connection.accessToken);
			const webhookSecret = randomBytes(32).toString("hex");

			await callSetWebhook(botToken, input.webhookUrl, webhookSecret);

			const existingConfig =
				connection.config?.provider === "telegram"
					? connection.config
					: undefined;
			const nextConfig: TelegramConfig = {
				...existingConfig,
				provider: "telegram",
				webhookSecret,
			};

			const [updated] = await db
				.update(integrationConnections)
				.set({ config: nextConfig })
				.where(eq(integrationConnections.id, connection.id))
				.returning({ id: integrationConnections.id });

			if (!updated) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to persist Telegram webhook secret",
				});
			}

			return { success: true as const, webhookUrl: input.webhookUrl };
		}),
} satisfies TRPCRouterRecord;
