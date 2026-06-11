/**
 * Browser-side dual-emit analytics (openpanel epic).
 *
 * Apps already own a `posthog-js` instance; this wraps that capture function
 * and fans out to OpenPanel too. The PostHog side is injected as a callback so
 * this module stays free of the `posthog-js` dependency and is safe to import
 * from any client bundle (web, marketing, desktop renderer).
 */

import { type OpenPanelEnv, resolveOpenPanelEnv } from "./env";
import type { AnalyticsEventName, EventProperties } from "./events";
import { redactPii } from "./sanitize";

export type PostHogCapture = (
	event: string,
	properties?: Record<string, unknown>,
) => void;

export interface ClientAnalyticsOptions {
	/** Existing `posthog.capture` from the host app. */
	posthogCapture?: PostHogCapture;
	/** Resolved OpenPanel env (defaults to reading `process.env`). */
	env?: OpenPanelEnv;
}

export interface ClientAnalytics {
	track<E extends AnalyticsEventName>(
		event: E,
		properties?: EventProperties<E>,
	): void;
	identify(distinctId: string, traits?: Record<string, unknown>): void;
}

function postToOpenPanel(
	env: OpenPanelEnv,
	body: { type: "track" | "identify"; payload: Record<string, unknown> },
): void {
	if (!env.clientId || typeof fetch === "undefined") return;
	try {
		void fetch(`${env.apiUrl.replace(/\/$/, "")}/track`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"openpanel-client-id": env.clientId,
			},
			body: JSON.stringify(body),
			keepalive: true,
		});
	} catch {
		// Best-effort: never let analytics break the UI.
	}
}

/**
 * Creates a browser dual-emit analytics client. Both providers are optional —
 * when neither PostHog nor OpenPanel is configured the returned client is a
 * silent no-op.
 */
export function createClientAnalytics(
	options: ClientAnalyticsOptions = {},
): ClientAnalytics {
	const env = options.env ?? resolveOpenPanelEnv();
	const posthogCapture = options.posthogCapture;

	return {
		track(event, properties) {
			const props = redactPii(properties as Record<string, unknown>);
			posthogCapture?.(event, props);
			postToOpenPanel(env, {
				type: "track",
				payload: { name: event, properties: props },
			});
		},
		identify(distinctId, traits) {
			postToOpenPanel(env, {
				type: "identify",
				payload: { profileId: distinctId, properties: redactPii(traits) },
			});
		},
	};
}
