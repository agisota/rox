/**
 * Environment variables for the RENDERER PROCESS (browser context).
 *
 * These values are injected at BUILD TIME by Vite's `define` in electron.vite.config.ts.
 * They are NOT read from process.env at runtime - Vite replaces the references with
 * literal strings during compilation.
 *
 * Only import this file in src/renderer/ code - never in main or shared code.
 *
 * For main process env vars, use src/main/env.main.ts instead.
 */
import { z } from "zod/v4";
import {
	LOCAL_PLAYWRIGHT_SMOKE_SCOPE,
	resolveE2EAuthBypass,
} from "./lib/e2e-auth-bypass";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	NEXT_PUBLIC_API_URL: z.url().default("https://api.rox.one"),
	NEXT_PUBLIC_WEB_URL: z.url().default("https://app.rox.one"),
	NEXT_PUBLIC_MARKETING_URL: z.url().default("https://rox.one"),
	NEXT_PUBLIC_ELECTRIC_URL: z
		.url()
		.default("https://electric-proxy.scharlesky-192.workers.dev"),
	NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
	NEXT_PUBLIC_POSTHOG_HOST: z.string().default("https://us.i.posthog.com"),
	NEXT_PUBLIC_OPENPANEL_CLIENT_ID: z.string().optional(),
	NEXT_PUBLIC_E2E_AUTH_BYPASS: z.string().optional(),
	NEXT_PUBLIC_E2E_AUTH_BYPASS_SCOPE: z.string().optional(),
	OPENPANEL_API_URL: z.string().default("https://api.openpanel.dev"),
	SENTRY_DSN_DESKTOP: z.string().optional(),
	RELAY_URL: z.url().default("https://relay.rox.one"),
});

/**
 * Build-time environment variables.
 *
 * Vite replaces these process.env.* and import.meta.env.* references at build time.
 * The values are baked into the bundle as string literals.
 */
const rawEnv = {
	// These are replaced by Vite's define at build time
	NODE_ENV: process.env.NODE_ENV,
	NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
	NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
	NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
	NEXT_PUBLIC_ELECTRIC_URL: process.env.NEXT_PUBLIC_ELECTRIC_URL,
	NEXT_PUBLIC_POSTHOG_KEY: import.meta.env.NEXT_PUBLIC_POSTHOG_KEY as
		| string
		| undefined,
	NEXT_PUBLIC_POSTHOG_HOST: import.meta.env.NEXT_PUBLIC_POSTHOG_HOST as
		| string
		| undefined,
	NEXT_PUBLIC_OPENPANEL_CLIENT_ID: import.meta.env
		.NEXT_PUBLIC_OPENPANEL_CLIENT_ID as string | undefined,
	NEXT_PUBLIC_E2E_AUTH_BYPASS: process.env.NEXT_PUBLIC_E2E_AUTH_BYPASS,
	NEXT_PUBLIC_E2E_AUTH_BYPASS_SCOPE:
		process.env.NEXT_PUBLIC_E2E_AUTH_BYPASS_SCOPE,
	OPENPANEL_API_URL: import.meta.env.OPENPANEL_API_URL as string | undefined,
	SENTRY_DSN_DESKTOP: import.meta.env.SENTRY_DSN_DESKTOP as string | undefined,
	RELAY_URL: process.env.RELAY_URL,
};

// Only allow skipping validation in development (never in production)
const SKIP_ENV_VALIDATION =
	process.env.NODE_ENV === "development" && !!process.env.SKIP_ENV_VALIDATION;
const RUNTIME_E2E_AUTH_BYPASS =
	typeof window !== "undefined" && window.App?.e2eAuthBypass === true;
const E2E_AUTH_BYPASS = resolveE2EAuthBypass({
	buildTime: {
		nodeEnv: process.env.NODE_ENV,
		flag: process.env.NEXT_PUBLIC_E2E_AUTH_BYPASS,
		scope: process.env.NEXT_PUBLIC_E2E_AUTH_BYPASS_SCOPE,
	},
	runtime: RUNTIME_E2E_AUTH_BYPASS
		? {
				nodeEnv: "production",
				flag: true,
				scope: LOCAL_PLAYWRIGHT_SMOKE_SCOPE,
			}
		: undefined,
});

export const env = {
	...(SKIP_ENV_VALIDATION
		? (rawEnv as z.infer<typeof envSchema>)
		: envSchema.parse(rawEnv)),
	SKIP_ENV_VALIDATION,
	E2E_AUTH_BYPASS,
};
