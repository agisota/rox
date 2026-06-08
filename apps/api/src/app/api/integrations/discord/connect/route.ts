import { auth } from "@rox/auth/server";
import { findOrgMembership } from "@rox/db/utils";

import { env } from "@/env";
import { createSignedState } from "@/lib/oauth-state";

const DISCORD_BOT_PERMISSIONS = "274877908992"; // Read messages + Send messages + Use slash commands

export async function GET(request: Request) {
	const url = new URL(request.url);
	const organizationId = url.searchParams.get("organizationId");

	if (!organizationId) {
		return Response.json(
			{ error: "Missing organizationId parameter" },
			{ status: 400 },
		);
	}

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const membership = await findOrgMembership({
		userId: session.user.id,
		organizationId,
	});

	if (!membership) {
		return Response.json(
			{ error: "User is not a member of this organization" },
			{ status: 403 },
		);
	}

	if (!env.DISCORD_CLIENT_ID) {
		return Response.json(
			{ error: "Discord integration not configured" },
			{ status: 503 },
		);
	}

	const state = createSignedState({
		organizationId,
		userId: session.user.id,
	});

	const redirectUri = `${env.NEXT_PUBLIC_API_URL}/api/integrations/discord/callback`;

	const discordAuthUrl = new URL("https://discord.com/api/oauth2/authorize");
	discordAuthUrl.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
	discordAuthUrl.searchParams.set("redirect_uri", redirectUri);
	discordAuthUrl.searchParams.set("response_type", "code");
	discordAuthUrl.searchParams.set("scope", "bot applications.commands");
	discordAuthUrl.searchParams.set("permissions", DISCORD_BOT_PERMISSIONS);
	discordAuthUrl.searchParams.set("state", state);

	return Response.redirect(discordAuthUrl.toString());
}
