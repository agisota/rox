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
	OPENPANEL_API_URL: import.meta.env.OPENPANEL_API_URL as string | undefined,
	SENTRY_DSN_DESKTOP: import.meta.env.SENTRY_DSN_DESKTOP as string | undefined,
	RELAY_URL: process.env.RELAY_URL,
};

// Only allow skipping validation in development (never in production)
const SKIP_ENV_VALIDATION =
	process.env.NODE_ENV === "development" && !!process.env.SKIP_ENV_VALIDATION;

// LOCAL_ONLY_AUTH (ROX-518): offline auth mode. Unlike SKIP_ENV_VALIDATION —
// which is a dev-only shorthand gated on NODE_ENV=development — LOCAL_ONLY_AUTH
// is production-readable and can be baked into a PACKAGED build at compile time
// via LOCAL_ONLY_AUTH=1/true (the offline desktop SKU). When set it produces an
// always-signed-in mock-org session with no cloud OAuth round-trip. Dev's
// SKIP_ENV_VALIDATION implies it so existing dev flows are unchanged.
//
// ⚠️ SECURITY BOUNDARY — offline SKU only:
// This value is INLINED at build time by Vite's `define` (see electron.vite.config.ts).
// A cloud production build is produced WITHOUT LOCAL_ONLY_AUTH in the build env,
// so the literal compiles to `false` and the auth gates below fall back to the
// real session. The flag can therefore never be flipped on at runtime in a cloud
// build — it must be deliberately opted into when building the offline SKU. Never
// set LOCAL_ONLY_AUTH in the cloud/production release build environment.
const LOCAL_ONLY_AUTH =
	SKIP_ENV_VALIDATION ||
	process.env.LOCAL_ONLY_AUTH === "1" ||
	process.env.LOCAL_ONLY_AUTH === "true";

export const env = {
	...(SKIP_ENV_VALIDATION
		? (rawEnv as z.infer<typeof envSchema>)
		: envSchema.parse(rawEnv)),
	SKIP_ENV_VALIDATION,
	/**
	 * Single shared predicate for offline / local-only auth mode (ROX-518).
	 * True when the build opted into LOCAL_ONLY_AUTH (offline SKU) or in dev via
	 * SKIP_ENV_VALIDATION. Consumers gate the always-signed-in mock-org session on
	 * this instead of SKIP_ENV_VALIDATION directly.
	 */
	isLocalOnlyAuth: LOCAL_ONLY_AUTH,
};
