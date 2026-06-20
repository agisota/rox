import { auth } from "@rox/auth/server";
import { FEATURE_FLAGS } from "@rox/shared/constants";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PostHog } from "posthog-node";
import { cache } from "react";

import { env } from "@/env";
import { resolveAgentsUiAccess } from "./resolveAgentsUiAccess";

const posthog = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
	host: env.NEXT_PUBLIC_POSTHOG_HOST,
	flushAt: 1,
	flushInterval: 0,
});

export const getAgentsUiAccess = cache(async () => {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session?.user) {
		redirect("/sign-in");
	}

	let flagValue: string | boolean | undefined;
	let evaluationFailed = false;

	try {
		flagValue = await posthog.getFeatureFlag(
			FEATURE_FLAGS.WEB_AGENTS_UI_ACCESS,
			session.user.id,
		);
	} catch (error) {
		evaluationFailed = true;
		console.error(
			"[getAgentsUiAccess] Failed to load the agents UI feature flag",
			error,
		);
	}

	const { hasAgentsUiAccess, degraded } = resolveAgentsUiAccess(
		flagValue,
		evaluationFailed,
	);

	return {
		hasAgentsUiAccess,
		degraded,
		session,
	};
});
