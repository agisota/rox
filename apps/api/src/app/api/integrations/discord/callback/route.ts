import { db } from "@rox/db/client";
import type { DiscordConfig } from "@rox/db/schema";
import { integrationConnections, members } from "@rox/db/schema";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import { verifySignedState } from "@/lib/oauth-state";

type DiscordTokenResponse = {
	access_token?: string;
	token_type?: string;
	expires_in?: number;
	refresh_token?: string;
	scope?: string;
	guild?: {
		id: string;
		name: string;
	};
	error?: string;
};

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");
	// Discord also passes guild_id as a top-level param in some install flows
	const guildId = url.searchParams.get("guild_id");

	if (error) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/discord?error=oauth_denied`,
		);
	}

	if (!code || !state) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/discord?error=missing_params`,
		);
	}

	const stateData = verifySignedState(state);
	if (!stateData) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/discord?error=invalid_state`,
		);
	}

	const { organizationId, userId } = stateData;

	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});

	if (!membership) {
		console.error("[discord/callback] Membership verification failed:", {
			organizationId,
			userId,
		});
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/discord?error=unauthorized`,
		);
	}

	if (
		!env.DISCORD_CLIENT_ID ||
		!env.DISCORD_CLIENT_SECRET ||
		!env.DISCORD_BOT_TOKEN
	) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/discord?error=not_configured`,
		);
	}

	const redirectUri = `${env.NEXT_PUBLIC_API_URL}/api/integrations/discord/callback`;

	const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: env.DISCORD_CLIENT_ID,
			client_secret: env.DISCORD_CLIENT_SECRET,
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
		}),
	}).catch(() => null);

	if (!tokenRes?.ok) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/discord?error=token_exchange_failed`,
		);
	}

	const tokenData = (await tokenRes.json()) as DiscordTokenResponse;

	if (tokenData.error) {
		console.error("[discord/callback] Token exchange error:", tokenData.error);
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/discord?error=token_exchange_failed`,
		);
	}

	const resolvedGuildId = tokenData.guild?.id ?? guildId ?? undefined;
	const resolvedGuildName = tokenData.guild?.name;

	const config: DiscordConfig = {
		provider: "discord",
		...(resolvedGuildId ? { guildId: resolvedGuildId } : {}),
	};

	// Store the bot token (env) as the operational access token; the OAuth
	// access token is only needed to verify the install completed.
	await db
		.insert(integrationConnections)
		.values({
			organizationId,
			connectedByUserId: userId,
			provider: "discord",
			accessToken: env.DISCORD_BOT_TOKEN,
			externalOrgId: resolvedGuildId,
			externalOrgName: resolvedGuildName,
			config,
		})
		.onConflictDoUpdate({
			target: [
				integrationConnections.organizationId,
				integrationConnections.provider,
			],
			set: {
				accessToken: env.DISCORD_BOT_TOKEN,
				externalOrgId: resolvedGuildId,
				externalOrgName: resolvedGuildName,
				connectedByUserId: userId,
				config,
				disconnectedAt: null,
				disconnectReason: null,
				updatedAt: new Date(),
			},
		});

	return Response.redirect(`${env.NEXT_PUBLIC_WEB_URL}/integrations/discord`);
}
