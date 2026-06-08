import { db } from "@rox/db/client";
import type { NotionConfig } from "@rox/db/schema";
import { integrationConnections, members } from "@rox/db/schema";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import { verifySignedState } from "@/lib/oauth-state";

type NotionTokenResponse = {
	access_token?: string;
	token_type?: string;
	bot_id?: string;
	workspace_id?: string;
	workspace_name?: string;
	workspace_icon?: string;
	owner?: unknown;
	error?: string;
};

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");

	if (error) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/notion?error=oauth_denied`,
		);
	}

	if (!code || !state) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/notion?error=missing_params`,
		);
	}

	const stateData = verifySignedState(state);
	if (!stateData) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/notion?error=invalid_state`,
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
		console.error("[notion/callback] Membership verification failed:", {
			organizationId,
			userId,
		});
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/notion?error=unauthorized`,
		);
	}

	if (!env.NOTION_CLIENT_ID || !env.NOTION_CLIENT_SECRET) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/notion?error=not_configured`,
		);
	}

	const redirectUri = `${env.NEXT_PUBLIC_API_URL}/api/integrations/notion/callback`;

	// Notion token exchange uses HTTP Basic auth
	const credentials = Buffer.from(
		`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`,
	).toString("base64");

	const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
		method: "POST",
		headers: {
			Authorization: `Basic ${credentials}`,
			"Content-Type": "application/json",
			"Notion-Version": "2022-06-28",
		},
		body: JSON.stringify({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
		}),
	}).catch(() => null);

	if (!tokenRes?.ok) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/notion?error=token_exchange_failed`,
		);
	}

	const tokenData = (await tokenRes.json()) as NotionTokenResponse;

	if (tokenData.error || !tokenData.access_token) {
		console.error("[notion/callback] Token exchange error:", tokenData.error);
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/notion?error=token_exchange_failed`,
		);
	}

	const config: NotionConfig = {
		provider: "notion",
		workspaceName: tokenData.workspace_name,
		botId: tokenData.bot_id,
	};

	await db
		.insert(integrationConnections)
		.values({
			organizationId,
			connectedByUserId: userId,
			provider: "notion",
			accessToken: tokenData.access_token,
			externalOrgId: tokenData.workspace_id,
			externalOrgName: tokenData.workspace_name,
			config,
		})
		.onConflictDoUpdate({
			target: [
				integrationConnections.organizationId,
				integrationConnections.provider,
			],
			set: {
				accessToken: tokenData.access_token,
				externalOrgId: tokenData.workspace_id,
				externalOrgName: tokenData.workspace_name,
				connectedByUserId: userId,
				config,
				disconnectedAt: null,
				disconnectReason: null,
				updatedAt: new Date(),
			},
		});

	return Response.redirect(`${env.NEXT_PUBLIC_WEB_URL}/integrations/notion`);
}
