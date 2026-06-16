"use client";

import { authClient } from "@rox/auth/client";
import {
	ATTRIBUTION_COOKIE_NAME,
	buildAttributionCookieValue,
	parseCookieHeader,
} from "@rox/shared/attribution";
import { parseUtmParams, utmToAnalyticsTraits } from "@rox/shared/utm";
import posthog from "posthog-js";
import { useEffect } from "react";

/** First-touch attribution cookie lifetime (90 days). */
const ATTRIBUTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export function PostHogUserIdentifier() {
	const { data: session } = authClient.useSession();

	// First-touch attribution: persist the landing UTM/referrer in a cookie ONCE
	// (never overwritten) so the better-auth account-creation hook can attribute
	// the new account server-side. Runs before login so anonymous landings count.
	useEffect(() => {
		if (typeof document === "undefined") return;
		if (parseCookieHeader(document.cookie, ATTRIBUTION_COOKIE_NAME)) return;
		const value = buildAttributionCookieValue({
			utm: parseUtmParams(window.location.search),
			landingPage: window.location.pathname,
			referrer: document.referrer || undefined,
		});
		// biome-ignore lint/suspicious/noDocumentCookie: lightweight first-party attribution cookie; CookieStore API isn't available across all targets.
		document.cookie = `${ATTRIBUTION_COOKIE_NAME}=${encodeURIComponent(
			value,
		)}; path=/; max-age=${ATTRIBUTION_COOKIE_MAX_AGE}; SameSite=Lax`;
	}, []);

	useEffect(() => {
		if (session?.user) {
			// Attach any utm_* params from the landing URL so the identified profile
			// carries marketing attribution. Empty when there are no UTM params, so
			// the spread is a no-op.
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
