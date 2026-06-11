/**
 * Server-side dual-emit analytics (openpanel epic).
 *
 * Emits every product event to BOTH PostHog and OpenPanel through one typed
 * call. The PostHog client is injected (the host app/package already owns a
 * `posthog-node` singleton — see `packages/trpc/src/lib/analytics.ts`), and the
 * OpenPanel client is the dependency-free `fetch` adapter from `./openpanel`.
 */

import type { AnalyticsEventName, EventProperties } from "./events";
import { createOpenPanelServerClient, type OpenPanelClient } from "./openpanel";
import { redactPii } from "./sanitize";

/** The slice of `posthog-node`'s client we depend on (kept structural). */
export interface PostHogLike {
	capture(args: {
		distinctId: string;
		event: string;
		properties?: Record<string, unknown>;
		groups?: Record<string, string>;
	}): void;
	identify?(args: {
		distinctId: string;
		properties?: Record<string, unknown>;
	}): void;
}

export interface ServerCaptureArgs<
	E extends AnalyticsEventName = AnalyticsEventName,
> {
	distinctId: string;
	event: E;
	properties?: EventProperties<E>;
	groups?: Record<string, string>;
}

export interface ServerIdentifyArgs {
	distinctId: string;
	traits?: Record<string, unknown>;
}

export interface DualAnalytics {
	capture<E extends AnalyticsEventName>(args: ServerCaptureArgs<E>): void;
	identify(args: ServerIdentifyArgs): void;
	openpanel: OpenPanelClient;
}

export interface CreateDualAnalyticsOptions {
	posthog: PostHogLike;
	openpanel?: OpenPanelClient;
}

/**
 * Wraps an existing PostHog client so callers get PostHog + OpenPanel emission
 * from a single `capture`/`identify`. OpenPanel emission is best-effort and
 * never blocks or throws.
 */
export function createDualAnalytics(
	options: CreateDualAnalyticsOptions,
): DualAnalytics {
	const { posthog } = options;
	const openpanel = options.openpanel ?? createOpenPanelServerClient();

	return {
		openpanel,
		capture({ distinctId, event, properties, groups }) {
			const props = redactPii(properties as Record<string, unknown>);
			posthog.capture({ distinctId, event, properties: props, groups });
			void openpanel.track({
				event,
				distinctId,
				properties: { ...props, ...(groups ? { groups } : {}) },
			});
		},
		identify({ distinctId, traits }) {
			const safeTraits = redactPii(traits);
			posthog.identify?.({ distinctId, properties: safeTraits });
			void openpanel.identify({ distinctId, traits: safeTraits });
		},
	};
}
