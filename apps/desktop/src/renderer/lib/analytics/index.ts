import {
	type AnalyticsEvent,
	type AnalyticsEventName,
	type ClientAnalytics,
	createClientAnalytics,
	type EventProperties,
} from "@rox/analytics";
import { env } from "renderer/env.renderer";
import { posthog } from "renderer/lib/posthog";

let analyticsClient: ClientAnalytics | null = null;

function getAnalyticsClient(): ClientAnalytics {
	if (!analyticsClient) {
		analyticsClient = createClientAnalytics({
			env: {
				clientId: env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID,
				clientSecret: undefined,
				apiUrl: env.OPENPANEL_API_URL,
			},
			posthogCapture: (event, properties) => {
				posthog.capture(event, properties);
			},
			posthogIdentify: (distinctId, traits) => {
				posthog.identify(distinctId, traits);
			},
			posthogReset: () => {
				posthog.reset();
			},
		});
	}

	return analyticsClient;
}

export function initAnalytics(): void {
	getAnalyticsClient();
}

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	posthog.capture(event, properties);
}

export function trackEvent<E extends AnalyticsEventName>(
	event: AnalyticsEvent<E>,
): void {
	getAnalyticsClient().track(event.name, event.properties);
}

export function trackAnalyticsEvent<E extends AnalyticsEventName>(
	event: E,
	properties?: EventProperties<E>,
): void {
	getAnalyticsClient().track(event, properties);
}

export function identifyAnalyticsUser(
	userId: string,
	traits?: Record<string, unknown>,
): void {
	getAnalyticsClient().identify(userId, traits);
}

export function resetAnalytics(): void {
	getAnalyticsClient().reset();
}

export function reloadAnalyticsFeatureFlags(): void {
	posthog.reloadFeatureFlags();
}
