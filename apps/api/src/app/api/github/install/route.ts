import { auth } from "@rox/auth/server";
import { findOrgMembership } from "@rox/db/utils";

import { env } from "@/env";
import { apiError } from "@/lib/api-response";
import { createSignedState } from "@/lib/oauth-state";

export async function GET(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user) {
		return apiError("Unauthorized", 401);
	}

	const url = new URL(request.url);
	const organizationId = url.searchParams.get("organizationId");

	if (!organizationId) {
		return apiError("Missing organizationId parameter", 400);
	}

	const membership = await findOrgMembership({
		userId: session.user.id,
		organizationId,
	});

	if (!membership) {
		return apiError("User is not a member of this organization", 403);
	}

	if (!env.GH_APP_ID) {
		return apiError("GitHub App not configured", 500);
	}

	const state = createSignedState({
		organizationId,
		userId: session.user.id,
	});

	const installUrl = new URL(
		`https://github.com/apps/${env.GH_APP_SLUG}/installations/new`,
	);
	installUrl.searchParams.set("state", state);
	installUrl.searchParams.set(
		"redirect_url",
		`${env.NEXT_PUBLIC_API_URL}/api/github/callback`,
	);

	return Response.redirect(installUrl.toString());
}
