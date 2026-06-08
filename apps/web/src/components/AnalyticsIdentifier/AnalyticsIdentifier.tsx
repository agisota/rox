"use client";

import { authClient } from "@rox/auth/client";
import { useEffect } from "react";

import { analytics } from "@/lib/analytics";

/**
 * Mirrors the authenticated user into OpenPanel (openpanel epic). Runs
 * alongside `PostHogUserIdentifier`; together they keep both analytics
 * providers identified from the same session.
 */
export function AnalyticsIdentifier() {
	const { data: session } = authClient.useSession();

	useEffect(() => {
		if (session?.user) {
			analytics.identify(session.user.id, {
				email: session.user.email,
				name: session.user.name,
			});
		}
	}, [session]);

	return null;
}
