import {
	ATTRIBUTION_COOKIE_NAME,
	attributionCookieDomain,
	buildAttributionCookieValue,
	parseCookieHeader,
} from "@rox/shared/attribution";
import { POSTHOG_COOKIE_NAME } from "@rox/shared/constants";
import { parseUtmParams } from "@rox/shared/utm";
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

import { env } from "@/env";
import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
	api_host: "/ingest",
	ui_host: "https://us.posthog.com",
	defaults: "2025-11-30",
	capture_pageview: "history_change",
	capture_pageleave: true,
	capture_exceptions: true,
	debug: false,
	cross_subdomain_cookie: true,
	persistence: "cookie",
	persistence_name: POSTHOG_COOKIE_NAME,
	disable_session_recording: true,
	loaded: (posthog) => {
		posthog.register({
			app_name: "marketing",
			domain: window.location.hostname,
		});

		const consent = localStorage.getItem(ANALYTICS_CONSENT_KEY);
		if (consent === "declined") {
			posthog.opt_out_capturing();
		} else if (!parseCookieHeader(document.cookie, ATTRIBUTION_COOKIE_NAME)) {
			// First-touch attribution: set the shared rox_attribution cookie once
			// (scoped to .rox.one) so app.rox.one can attribute the signup.
			const value = buildAttributionCookieValue({
				utm: parseUtmParams(window.location.search),
				landingPage: window.location.pathname,
				referrer: document.referrer || undefined,
			});
			const domain = attributionCookieDomain(window.location.hostname);
			const domainAttr = domain ? `; domain=${domain}` : "";
			// biome-ignore lint/suspicious/noDocumentCookie: first-party attribution cookie; CookieStore API isn't universally available.
			document.cookie = `${ATTRIBUTION_COOKIE_NAME}=${encodeURIComponent(
				value,
			)}; path=/${domainAttr}; max-age=${60 * 60 * 24 * 90}; SameSite=Lax`;
		}
	},
});

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_MARKETING,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	enabled: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production",
	tracesSampleRate:
		env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production" ? 0.1 : 1.0,
	replaysSessionSampleRate: 0,
	replaysOnErrorSampleRate: 0,
	sendDefaultPii: true,
	debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
