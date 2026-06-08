import { POSTHOG_COOKIE_NAME } from "@rox/shared/constants";
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

import { env } from "@/env";
import { isOpenPanelEnabled } from "@/lib/analytics";

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
	loaded: (posthog) => {
		posthog.register({
			app_name: "web",
			domain: window.location.hostname,
			// OpenPanel (openpanel epic) dual-emit status — the browser client is
			// initialised lazily by `@/lib/analytics`; page views are emitted by
			// `AnalyticsPageView` and identify by `AnalyticsIdentifier`.
			openpanel_enabled: isOpenPanelEnabled,
		});
	},
});

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_WEB,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	enabled: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production",
	tracesSampleRate:
		env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production" ? 0.1 : 1.0,
	// Session replay stays off here. OpenPanel replay (openpanel epic) ships with
	// the OpenPanel SDK and must mask PII (inputs, prompt text, emails) to match
	// this `sendDefaultPii` posture before it is enabled in the browser bundle.
	replaysSessionSampleRate: 0,
	replaysOnErrorSampleRate: 0,
	sendDefaultPii: true,
	debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
