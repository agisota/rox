import { LinearClient } from "@linear/sdk";
import { db } from "@rox/db/client";
import { integrationConnections, members } from "@rox/db/schema";
import { storeSecret } from "@rox/trpc/integration-secret";
import { linearTokenResponseSchema } from "@rox/trpc/integrations/linear";
import { Client } from "@upstash/qstash";
import { and, eq, sql } from "drizzle-orm";

import { env } from "@/env";
import { buildLinearRedirectUri } from "@/lib/integrations/linear-oauth";
import { verifySignedState } from "@/lib/oauth-state";

const qstash = new Client({ token: env.QSTASH_TOKEN });

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");

	if (error) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?error=oauth_denied`,
		);
	}

	if (!code || !state) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?error=missing_params`,
		);
	}

	// Verify signed state (prevents forgery)
	const stateData = verifySignedState(state);
	if (!stateData) {
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?error=invalid_state`,
		);
	}

	const { organizationId, userId } = stateData;

	// Re-verify membership at callback time (defense-in-depth)
	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});

	if (!membership) {
		console.error("[linear/callback] Membership verification failed:", {
			organizationId,
			userId,
		});
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?error=unauthorized`,
		);
	}

	const redirectUri = buildLinearRedirectUri(env.NEXT_PUBLIC_API_URL);

	const tokenResponse = await fetch("https://api.linear.app/oauth/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: env.LINEAR_CLIENT_ID,
			client_secret: env.LINEAR_CLIENT_SECRET,
			redirect_uri: redirectUri,
			code,
		}),
	});

	if (!tokenResponse.ok) {
		// Surface the real reason (e.g. redirect_uri mismatch, invalid client) so
		// the failure is diagnosable instead of an opaque "token_exchange_failed".
		const body = await tokenResponse.text().catch(() => "");
		console.error("[linear/callback] Token exchange failed:", {
			status: tokenResponse.status,
			redirectUri,
			body: body.slice(0, 500),
		});
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?error=token_exchange_failed`,
		);
	}

	// Parse the token response, fetch the Linear org, and persist the connection.
	// Linear may omit refresh_token (long-lived default grant); the schema now
	// treats it as optional, and any failure here is logged + surfaced gracefully
	// rather than throwing an unhandled 500.
	try {
		const tokenData = linearTokenResponseSchema.parse(
			await tokenResponse.json(),
		);

		const linearClient = new LinearClient({
			accessToken: tokenData.access_token,
		});
		const viewer = await linearClient.viewer;
		const linearOrg = await viewer.organization;

		const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
		const storedAccessToken = storeSecret(tokenData.access_token);
		const refreshToken = tokenData.refresh_token
			? storeSecret(tokenData.refresh_token)
			: null;

		await db
			.insert(integrationConnections)
			.values({
				organizationId,
				connectedByUserId: userId,
				provider: "linear",
				accessToken: storedAccessToken,
				refreshToken,
				tokenExpiresAt,
				externalOrgId: linearOrg.id,
				externalOrgName: linearOrg.name,
			})
			.onConflictDoUpdate({
				target: [
					integrationConnections.organizationId,
					integrationConnections.provider,
				],
				// Migration 0064 replaced the simple (org, provider) unique with two
				// PARTIAL unique indexes. The org-level arbiter is
				// `integration_connections_org_provider_unique` WHERE workspace_id IS
				// NULL. Postgres only matches a partial unique index when the conflict
				// target carries the same predicate, so without this targetWhere the
				// upsert throws 42P10 ("no unique or exclusion constraint matching the
				// ON CONFLICT specification") and the connect fails at finalize.
				targetWhere: sql`${integrationConnections.workspaceId} IS NULL`,
				set: {
					accessToken: storedAccessToken,
					refreshToken,
					tokenExpiresAt,
					disconnectedAt: null,
					disconnectReason: null,
					externalOrgId: linearOrg.id,
					externalOrgName: linearOrg.name,
					connectedByUserId: userId,
					updatedAt: new Date(),
				},
			});
	} catch (connectError) {
		// Surface a precise reason (name + message + any pg error code/constraint)
		// WITHOUT logging tokens, so Vercel logs show why finalize failed instead of
		// an opaque "token_exchange_failed". Likely culprits: a Postgres 42P10/23505
		// on the partial unique index, or a Linear GraphQL/scope error from
		// viewer/organization.
		const e = connectError as {
			name?: string;
			message?: string;
			code?: string;
			constraint?: string;
		};
		console.error("[linear/callback] Failed to finalize Linear connection:", {
			name: e?.name,
			message: e?.message,
			code: e?.code,
			constraint: e?.constraint,
		});
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?error=token_exchange_failed`,
		);
	}

	try {
		await qstash.publishJSON({
			url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/jobs/initial-sync`,
			body: { organizationId, creatorUserId: userId },
			retries: 3,
		});
	} catch (error) {
		console.error("Failed to queue initial sync job:", error);
		return Response.redirect(
			`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear?warning=sync_queued_failed`,
		);
	}

	return Response.redirect(`${env.NEXT_PUBLIC_WEB_URL}/integrations/linear`);
}
