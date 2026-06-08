import { auth } from "@rox/auth/server";
import { findOrgMembership } from "@rox/db/utils";

import { env } from "@/env";
import { createSignedState } from "@/lib/oauth-state";

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

	if (!env.LARK_APP_ID) {
		return Response.json(
			{ error: "Lark integration not configured" },
			{ status: 503 },
		);
	}

	const state = createSignedState({
		organizationId,
		userId: session.user.id,
	});

	const redirectUri = `${env.NEXT_PUBLIC_API_URL}/api/integrations/lark/callback`;

	// International Lark OAuth2 authorization endpoint
	const larkAuthUrl = new URL(
		"https://open.larksuite.com/open-apis/authen/v1/authorize",
	);
	larkAuthUrl.searchParams.set("app_id", env.LARK_APP_ID);
	larkAuthUrl.searchParams.set("redirect_uri", redirectUri);
	larkAuthUrl.searchParams.set("state", state);

	return Response.redirect(larkAuthUrl.toString());
}
