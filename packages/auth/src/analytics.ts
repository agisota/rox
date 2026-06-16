/**
 * Best-effort server-side analytics for auth lifecycle events (openpanel epic,
 * #35).
 *
 * Auth is a low-level package and cannot import the tRPC analytics singleton
 * (that would be circular), so it owns a tiny, lazily-constructed posthog-node
 * client keyed off the same NEXT_PUBLIC_POSTHOG_KEY the apps already set. When
 * the key is absent (tests / local) the client is a no-op. `captureAuthEvent`
 * never throws and never blocks the caller — auth flows must not depend on it.
 */

import type { AnalyticsEventName } from "@rox/shared/constants";
import { PostHog } from "posthog-node";

// `undefined` = not yet resolved; `null` = resolved to no-op (no key configured).
let client: PostHog | null | undefined;

function getClient(): PostHog | null {
	if (client !== undefined) return client;
	const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
	if (!key) {
		client = null;
		return null;
	}
	client = new PostHog(key, {
		host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
		// Short-lived server processes (Vercel functions): flush every event.
		flushAt: 1,
		flushInterval: 0,
	});
	return client;
}

/**
 * Emit one server-side auth event to PostHog. Best-effort: a missing key or any
 * error is swallowed so account creation / sign-in never fails because of it.
 */
export function captureAuthEvent(
	event: AnalyticsEventName,
	distinctId: string,
	properties?: Record<string, unknown>,
): void {
	try {
		const posthog = getClient();
		if (!posthog) return;
		posthog.capture({ distinctId, event, properties });
	} catch (error) {
		console.error("[auth-analytics] capture failed", error);
	}
}
