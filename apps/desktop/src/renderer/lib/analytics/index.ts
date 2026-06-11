import type {
	AnalyticsEventName,
	EventProperties,
} from "@rox/analytics/events";
import { posthog } from "renderer/lib/posthog";
import { getOpenPanelClient } from "./openpanel";

export { initOpenPanel, setOpenPanelTelemetryEnabled } from "./openpanel";

/**
 * Legacy, loosely-typed capture. Emits to PostHog only and accepts any event
 * name — kept for the many existing string call sites in the renderer.
 * Prefer `trackEvent` for new product events.
 */
export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	posthog.capture(event, properties);
}

/**
 * Typed product-event capture. Names and payloads are constrained by the shared
 * `@rox/analytics` catalog, and emission fans out to BOTH PostHog and OpenPanel
 * (with PII redaction) via the shared client. A no-op when telemetry is off.
 */
export function trackEvent<E extends AnalyticsEventName>(
	event: E,
	properties?: EventProperties<E>,
): void {
	const client = getOpenPanelClient();
	if (client) {
		client.track(event, properties);
		return;
	}
	// Telemetry disabled — still nothing leaves the process.
}

/**
 * Associate the current device/session with an authenticated user across both
 * analytics providers. PII in traits is redacted inside the shared client.
 */
export function identify(
	distinctId: string,
	traits?: Record<string, unknown>,
): void {
	getOpenPanelClient()?.identify(distinctId, traits);
}
