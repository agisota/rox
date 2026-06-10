/**
 * Environment variables for the MAIN PROCESS (Node.js context).
 *
 * This file uses t3-env with process.env which works at runtime in Node.js.
 * Only import this file in src/main/ code - never in renderer or shared code.
 *
 * For renderer process env vars, use src/renderer/env.renderer.ts instead.
 */
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

function isTruthyEnv(value: string | undefined): boolean {
	return value === "1" || value === "true";
}

const skipEnvValidation =
	process.env.NODE_ENV === "development" &&
	isTruthyEnv(process.env.SKIP_ENV_VALIDATION);
const localOnlyAuth =
	skipEnvValidation || isTruthyEnv(process.env.LOCAL_ONLY_AUTH);

export const env = createEnv({
	server: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		LOCAL_ONLY_AUTH: z.boolean().default(false),
		// Confirmed rox domains
		NEXT_PUBLIC_API_URL: z.url().default("https://api.rox.one"),
		NEXT_PUBLIC_WEB_URL: z.url().default("https://app.rox.one"),
		// TODO(rox): confirm these subdomains exist / are deployed
		NEXT_PUBLIC_STREAMS_URL: z.url().default("https://streams.rox.one"),
		NEXT_PUBLIC_ELECTRIC_URL: z
			.url()
			.default("https://electric-proxy.avi-6ac.workers.dev"),
		NEXT_PUBLIC_MARKETING_URL: z.url().default("https://rox.one"),
		NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
		NEXT_PUBLIC_POSTHOG_HOST: z.string().default("https://us.i.posthog.com"),
		SENTRY_DSN_DESKTOP: z.string().optional(),
		// TODO(rox): confirm streams/relay backends are deployed under rox.one
		STREAMS_URL: z.url().default("https://streams.rox.one"),
		RELAY_URL: z.url().default("https://relay.rox.one"),
	},

	runtimeEnv: {
		...process.env,
		// Explicitly list env vars so Vite can replace them at build time
		// (spreading process.env only works at runtime, not for bundled apps)
		NODE_ENV: process.env.NODE_ENV,
		LOCAL_ONLY_AUTH: localOnlyAuth,
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
	skipValidation: skipEnvValidation,

	// Main process runs in trusted Node.js environment
	isServer: true,
});
