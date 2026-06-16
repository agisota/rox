"use client";

import { authClient } from "@rox/auth/client";
import {
	ATTRIBUTION_COOKIE_NAME,
	attributionCookieDomain,
	buildAttributionCookieValue,
	parseCookieHeader,
} from "@rox/shared/attribution";
import { ANALYTICS_EVENTS } from "@rox/shared/constants";
import { parseUtmParams, utmToAnalyticsTraits } from "@rox/shared/utm";
import posthog from "posthog-js";
import { useEffect } from "react";

/** First-touch attribution cookie lifetime (90 days). */
const ATTRIBUTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export function PostHogUserIdentifier() {
	const { data: session } = authClient.useSession();

	// First-touch attribution: persist the landing UTM/referrer in a cookie ONCE
	// (never overwritten). Scoped to the shared parent domain when on rox.one so
	// a first touch on the marketing site is readable by the app on signup.
	useEffect(() => {
		if (typeof document === "undefined") return;
		if (parseCookieHeader(document.cookie, ATTRIBUTION_COOKIE_NAME)) return;
		const value = buildAttributionCookieValue({
			utm: parseUtmParams(window.location.search),
			landingPage: window.location.pathname,
			referrer: document.referrer || undefined,
		});
		const domain = attributionCookieDomain(window.location.hostname);
		const domainAttr = domain ? `; domain=${domain}` : "";
		// biome-ignore lint/suspicious/noDocumentCookie: lightweight first-party attribution cookie; CookieStore API isn't available across all targets.
		document.cookie = `${ATTRIBUTION_COOKIE_NAME}=${encodeURIComponent(
			value,
		)}; path=/${domainAttr}; max-age=${ATTRIBUTION_COOKIE_MAX_AGE}; SameSite=Lax`;
	}, []);

	// session_started: once per app load (a hard navigation remounts providers).
	useEffect(() => {
		posthog.capture(ANALYTICS_EVENTS.SESSION_STARTED, { app: "web" });
	}, []);

	useEffect(() => {
		if (session?.user) {
			// Attach any utm_* params from the landing URL so the identified profile
			// carries marketing attribution. account_created / signed_in are emitted
			// server-side from the better-auth hooks (more robust than a client
			// heuristic around OAuth redirects).
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
