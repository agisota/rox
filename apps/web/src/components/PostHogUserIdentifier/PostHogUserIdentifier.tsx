"use client";

import { authClient } from "@rox/auth/client";
import { parseUtmParams, utmToAnalyticsTraits } from "@rox/shared/utm";
import posthog from "posthog-js";
import { useEffect } from "react";

export function PostHogUserIdentifier() {
	const { data: session } = authClient.useSession();

	useEffect(() => {
		if (session?.user) {
			// First-touch acquisition: attach any utm_* params from the landing URL
			// so the identified profile carries marketing attribution. Empty when
			// there are no UTM params, so the spread is a no-op.
			const utmTraits =
				typeof window === "undefined"
					? {}
					: utmToAnalyticsTraits(parseUtmParams(window.location.search));
			posthog.identify(session.user.id, {
				email: session.user.email,
				name: session.user.name,
				...utmTraits,
			});
		} else if (session === null) {
			posthog.reset();
		}
	}, [session]);

	return null;
}
