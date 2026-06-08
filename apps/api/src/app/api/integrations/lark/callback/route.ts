import { db } from "@rox/db/client";
import type { LarkConfig } from "@rox/db/schema";
import { integrationConnections, members } from "@rox/db/schema";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import { verifySignedState } from "@/lib/oauth-state";

type LarkTokenResponse = {
	code?: number;
	msg?: string;
	data?: {
		access_token: string;
		refresh_token: string;
		token_type: string;
		expires_in: number;
		refresh_expires_in: number;
		tenant_key: string;
		open_id?: string;
		name?: string;
	};
};

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");

	if (error) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/lark?error=oauth_denied`,
		);
	}

	if (!code || !state) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/lark?error=missing_params`,
		);
	}

	const stateData = verifySignedState(state);
	if (!stateData) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/lark?error=invalid_state`,
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
		console.error("[lark/callback] Membership verification failed:", {
			organizationId,
			userId,
		});
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/lark?error=unauthorized`,
		);
	}

	if (!env.LARK_APP_ID || !env.LARK_APP_SECRET) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/lark?error=not_configured`,
		);
	}

	const tokenRes = await fetch(
		"https://open.larksuite.com/open-apis/authen/v1/access_token",
		{
			method: "POST",
			headers: { "Content-Type": "application/json; charset=utf-8" },
			body: JSON.stringify({
				app_id: env.LARK_APP_ID,
				app_secret: env.LARK_APP_SECRET,
				grant_type: "authorization_code",
				code,
			}),
		},
	).catch(() => null);

	if (!tokenRes?.ok) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/lark?error=token_exchange_failed`,
		);
	}

	const tokenData = (await tokenRes.json()) as LarkTokenResponse;

	if (tokenData.code !== 0 || !tokenData.data?.access_token) {
		console.error("[lark/callback] Token exchange failed:", tokenData.msg);
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/lark?error=token_exchange_failed`,
		);
	}

	const { access_token, refresh_token, expires_in, tenant_key } =
		tokenData.data;
	const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

	const config: LarkConfig = {
		provider: "lark",
		tenantKey: tenant_key,
	};

	await db
		.insert(integrationConnections)
		.values({
			organizationId,
			connectedByUserId: userId,
			provider: "lark",
			accessToken: access_token,
			refreshToken: refresh_token,
			tokenExpiresAt,
			externalOrgId: tenant_key,
			externalOrgName: tenant_key,
			config,
		})
		.onConflictDoUpdate({
			target: [
				integrationConnections.organizationId,
				integrationConnections.provider,
			],
			set: {
				accessToken: access_token,
				refreshToken: refresh_token,
				tokenExpiresAt,
				externalOrgId: tenant_key,
				externalOrgName: tenant_key,
				connectedByUserId: userId,
				config,
				disconnectedAt: null,
				disconnectReason: null,
				updatedAt: new Date(),
			},
		});

	return Response.redirect(`${env.NEXT_PUBLIC_WEB_URL}/integrations/lark`);
}
