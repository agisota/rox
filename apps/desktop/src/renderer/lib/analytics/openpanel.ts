/**
 * OpenPanel renderer client (openpanel epic, T-OPENPANEL slice).
 *
 * Wires the `@rox/analytics` browser client into the desktop renderer. The
 * heavy lifting (dual-emit, PII redaction, fire-and-forget transport) lives in
 * the shared package; this module only:
 *   1. resolves the renderer's build-time OpenPanel config,
 *   2. injects the existing `posthog.capture` so events fan out to both,
 *   3. gates emission on the telemetry opt-out toggle (TelemetrySync owns it).
 *
 * Secrets are never hardcoded — the client id comes from `env.renderer.ts`,
 * which Vite injects at build time. When unset, the client is a silent no-op.
 */

import {
	type ClientAnalytics,
	createClientAnalytics,
} from "@rox/analytics/client";
import { env } from "renderer/env.renderer";
import { posthog } from "renderer/lib/posthog";

/** Telemetry opt-out gate, mirrored from the desktop settings via TelemetrySync. */
let telemetryEnabled = true;

/** Lazily-created shared client; rebuilt only if it has not been initialized. */
let client: ClientAnalytics | undefined;

function getClient(): ClientAnalytics {
	if (!client) {
		client = createClientAnalytics({
			posthogCapture: (event, properties) => posthog.capture(event, properties),
			env: {
				clientId: env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID,
				clientSecret: undefined,
				apiUrl: env.OPENPANEL_API_URL,
			},
		});
	}
	return client;
}

/**
 * Called by TelemetrySync when the user's opt-out preference resolves/changes.
 * When disabled, both `track` and `identify` become no-ops.
 */
export function setOpenPanelTelemetryEnabled(enabled: boolean): void {
	telemetryEnabled = enabled;
}

/** Underlying client, honoring the opt-out gate. Internal to the wrapper. */
export function getOpenPanelClient(): ClientAnalytics | undefined {
	if (!telemetryEnabled) return undefined;
	return getClient();
}

/**
 * Initialize the OpenPanel client during renderer boot. Idempotent and safe to
 * call even when unconfigured — the shared client is a no-op without a client
 * id. Called from the root provider alongside PostHog init.
 */
export function initOpenPanel(): void {
	if (!env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID) {
		// Unconfigured is a normal state (any build without the client id); stay
		// silent rather than logging to every user's DevTools.
		return;
	}
	// Warm the singleton so the first product event has zero setup cost.
	getClient();
}
