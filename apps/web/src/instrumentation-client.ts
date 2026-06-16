import { POSTHOG_COOKIE_NAME } from "@rox/shared/constants";
import { posthogSessionReplayOptions } from "@rox/shared/posthog-session-replay";
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

import { env } from "@/env";

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
	// Session replay: OFF unless explicitly enabled; always masks inputs + text.
	...posthogSessionReplayOptions(
		env.NEXT_PUBLIC_POSTHOG_SESSION_REPLAY === "true",
	),
	loaded: (posthog) => {
		posthog.register({
			app_name: "web",
			domain: window.location.hostname,
		});
	},
});

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_WEB,
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
