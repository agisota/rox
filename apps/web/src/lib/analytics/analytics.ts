/**
 * Browser dual-emit analytics for the web app (openpanel epic).
 *
 * Wraps the app's existing `posthog-js` instance and fans every canonical
 * product event out to OpenPanel too, via the dependency-free client from
 * `@rox/analytics`. OpenPanel env is read from the app's validated `env` (Next
 * only inlines `NEXT_PUBLIC_*` vars referenced literally, so we pass them
 * explicitly rather than letting the package read `process.env`).
 */

import { createClientAnalytics } from "@rox/analytics/client";
import type { OpenPanelEnv } from "@rox/analytics/env";
import posthog from "posthog-js";

import { env } from "@/env";

const DEFAULT_OPENPANEL_API_URL = "https://api.openpanel.dev";

export const openPanelEnv: OpenPanelEnv = {
	clientId: env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID,
	// Secret is server-only; the browser ingests with just the client id.
	clientSecret: undefined,
	apiUrl: env.NEXT_PUBLIC_OPENPANEL_API_URL ?? DEFAULT_OPENPANEL_API_URL,
};

/** True when OpenPanel is configured enough to emit from the browser. */
export const isOpenPanelEnabled = Boolean(openPanelEnv.clientId);

/**
 * Dual-emit client: canonical product events + identify reach both PostHog and
 * OpenPanel through one typed call.
 */
export const analytics = createClientAnalytics({
	posthogCapture: (event, properties) => {
		posthog.capture(event, properties);
	},
	env: openPanelEnv,
});

/** First-touch acquisition context parsed from the current URL. */
export interface PageContext {
	path: string;
	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;
	referrer?: string;
}

const UTM_KEYS = [
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
] as const;

/** Reads path, UTM params and referrer from the live `window`. */
export function readPageContext(path: string): PageContext {
	const context: PageContext = { path };
	if (typeof window === "undefined") return context;

	const params = new URLSearchParams(window.location.search);
	for (const key of UTM_KEYS) {
		const value = params.get(key);
		if (value) context[key] = value;
	}
	if (document.referrer) context.referrer = document.referrer;
	return context;
}

/**
 * Emits an OpenPanel `screen_view` for the given path. PostHog already captures
 * page views itself (`capture_pageview: "history_change"`), so this only mirrors
 * the page view to OpenPanel. Best-effort and fire-and-forget.
 */
export function trackPageView(path: string): void {
	const clientId = openPanelEnv.clientId;
	if (!clientId || typeof fetch === "undefined") return;

	const properties = readPageContext(path);
	try {
		void fetch(`${openPanelEnv.apiUrl.replace(/\/$/, "")}/track`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"openpanel-client-id": clientId,
			},
			body: JSON.stringify({
				type: "track",
				payload: { name: "screen_view", properties },
			}),
			keepalive: true,
		});
	} catch {
		// Best-effort: analytics must never break the UI.
	}
}
