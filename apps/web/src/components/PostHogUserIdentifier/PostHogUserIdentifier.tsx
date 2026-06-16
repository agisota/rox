"use client";

import { authClient } from "@rox/auth/client";
import {
	ATTRIBUTION_COOKIE_NAME,
	buildAttributionCookieValue,
	parseCookieHeader,
} from "@rox/shared/attribution";
import { ANALYTICS_EVENTS } from "@rox/shared/constants";
import { parseUtmParams, utmToAnalyticsTraits } from "@rox/shared/utm";
import posthog from "posthog-js";
import { useEffect } from "react";

/** First-touch attribution cookie lifetime (90 days). */
const ATTRIBUTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

/** A freshly-created account is one made within this window before first sight. */
const NEW_ACCOUNT_WINDOW_MS = 2 * 60 * 1000;

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

	// session_started: once per app load (a hard navigation remounts providers).
	useEffect(() => {
		posthog.capture(ANALYTICS_EVENTS.SESSION_STARTED, { app: "web" });
	}, []);

	useEffect(() => {
		if (session?.user) {
			const user = session.user;
			// Attach any utm_* params from the landing URL so the identified profile
			// (and the acquisition events below) carry marketing attribution.
			const utmTraits =
				typeof window === "undefined"
					? {}
					: utmToAnalyticsTraits(parseUtmParams(window.location.search));
			posthog.identify(user.id, {
				email: user.email,
				name: user.name,
				...utmTraits,
			});

			// Acquisition events. OAuth sign-in is a full redirect, so we detect a
			// fresh authentication via per-tab storage rather than a null→user
			// transition (which the redirect resets). Best-effort — storage may be
			// blocked.
			try {
				const SIGNED_IN_KEY = "rox_signed_in_uid";
				if (sessionStorage.getItem(SIGNED_IN_KEY) !== user.id) {
					sessionStorage.setItem(SIGNED_IN_KEY, user.id);
					posthog.capture(ANALYTICS_EVENTS.SIGNED_IN, { method: "github" });

					// account_created: brand-new account (created within the window),
					// emitted at most once per user across reloads.
					const createdAtMs = user.createdAt
						? new Date(user.createdAt).getTime()
						: 0;
					const isNewAccount =
						createdAtMs > 0 && Date.now() - createdAtMs < NEW_ACCOUNT_WINDOW_MS;
					const ACCOUNT_KEY = `rox_account_created_${user.id}`;
					if (isNewAccount && localStorage.getItem(ACCOUNT_KEY) !== "1") {
						localStorage.setItem(ACCOUNT_KEY, "1");
						posthog.capture(ANALYTICS_EVENTS.ACCOUNT_CREATED, { ...utmTraits });
					}
				}
			} catch {
				// Storage unavailable (private mode / blocked) — skip best-effort events.
			}
		} else if (session === null) {
			posthog.reset();
		}
	}, [session]);

	return null;
}
