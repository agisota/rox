import { createOpenPanelServerClient } from "@rox/analytics/openpanel";
import { createDualAnalytics } from "@rox/analytics/server";
import { PostHog } from "posthog-node";
import { env } from "../env";

// Singleton — all server-side product event captures go through this client.
// flushAt: 1, flushInterval: 0 mirrors apps/api/src/lib/analytics.ts so we
// don't lose events on short-lived processes (Vercel functions, edge handlers).
export const posthog = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
	host: env.NEXT_PUBLIC_POSTHOG_HOST,
	flushAt: 1,
	flushInterval: 0,
});

// Dual-emit wrapper (openpanel epic): every `analytics.capture`/`identify`
// fans out to BOTH PostHog and OpenPanel. OpenPanel is best-effort — when its
// credentials are unset the underlying client is a no-op, so dual-emit
// transparently degrades to PostHog-only.
export const analytics = createDualAnalytics({
	posthog,
	openpanel: createOpenPanelServerClient({
		clientId: env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID,
		clientSecret: env.OPENPANEL_CLIENT_SECRET,
		apiUrl: env.OPENPANEL_API_URL,
	}),
});
