/**
 * Environment variables for the MAIN PROCESS (Node.js context).
 *
 * This file uses t3-env with process.env which works at runtime in Node.js.
 * Only import this file in src/main/ code - never in renderer or shared code.
 *
 * For renderer process env vars, use src/renderer/env.renderer.ts instead.
 */
import { SERVICE_URLS } from "@superset/shared/constants";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export const env = createEnv({
	server: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		NEXT_PUBLIC_API_URL: z.url().default(SERVICE_URLS.API),
		NEXT_PUBLIC_STREAMS_URL: z.url().default(SERVICE_URLS.STREAMS),
		NEXT_PUBLIC_ELECTRIC_URL: z.url().default(SERVICE_URLS.ELECTRIC),
		NEXT_PUBLIC_WEB_URL: z.url().default(SERVICE_URLS.WEB),
		NEXT_PUBLIC_MARKETING_URL: z.url().default(SERVICE_URLS.MARKETING),
		NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
		NEXT_PUBLIC_POSTHOG_HOST: z.string().default("https://us.i.posthog.com"),
		SENTRY_DSN_DESKTOP: z.string().optional(),
		STREAMS_URL: z.url().default(SERVICE_URLS.STREAMS),
		RELAY_URL: z.url().default(SERVICE_URLS.RELAY),
	},

	runtimeEnv: {
		...process.env,
		// Explicitly list env vars so Vite can replace them at build time
		// (spreading process.env only works at runtime, not for bundled apps)
		NODE_ENV: process.env.NODE_ENV,
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_STREAMS_URL: process.env.NEXT_PUBLIC_STREAMS_URL,
		NEXT_PUBLIC_ELECTRIC_URL: process.env.NEXT_PUBLIC_ELECTRIC_URL,
		NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
		NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
		NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
		NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
		SENTRY_DSN_DESKTOP: process.env.SENTRY_DSN_DESKTOP,
		STREAMS_URL: process.env.STREAMS_URL,
		RELAY_URL: process.env.RELAY_URL,
	},
	emptyStringAsUndefined: true,
	// Only allow skipping validation in development (never in production)
	skipValidation:
		process.env.NODE_ENV === "development" && !!process.env.SKIP_ENV_VALIDATION,

	// Main process runs in trusted Node.js environment
	isServer: true,
});
