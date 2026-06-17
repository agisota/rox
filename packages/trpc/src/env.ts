import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		BLOB_READ_WRITE_TOKEN: z.string().min(1),
		POSTHOG_API_KEY: z.string(),
		POSTHOG_API_HOST: z.string().url().default("https://us.posthog.com"),
		POSTHOG_PROJECT_ID: z.string(),
		NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
		NEXT_PUBLIC_POSTHOG_HOST: z
			.string()
			.url()
			.default("https://us.i.posthog.com"),
		// OpenPanel (openpanel epic) — second analytics provider. Optional so
		// environments without OpenPanel configured keep working (dual-emit
		// degrades to PostHog-only).
		NEXT_PUBLIC_OPENPANEL_CLIENT_ID: z.string().optional(),
		OPENPANEL_CLIENT_SECRET: z.string().optional(),
		OPENPANEL_API_URL: z.string().url().default("https://api.openpanel.dev"),
		QSTASH_TOKEN: z.string().min(1),
		QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
		QSTASH_NEXT_SIGNING_KEY: z.string().min(1),
		RESEND_API_KEY: z.string().min(1),
		NEXT_PUBLIC_API_URL: z.string().url(),
		NEXT_PUBLIC_WEB_URL: z.string().url(),
		KV_REST_API_URL: z.string().url().optional(),
		KV_REST_API_TOKEN: z.string().optional(),
		// GitHub App credentials
		GH_APP_ID: z.string().min(1),
		GH_APP_PRIVATE_KEY: z.string().min(1),
		GH_WEBHOOK_SECRET: z.string().min(1),
		SECRETS_ENCRYPTION_KEY: z.string().min(1),
		ANTHROPIC_API_KEY: z.string(),
		RELAY_URL: z.string().url(),
		LINEAR_CLIENT_ID: z.string().min(1),
		LINEAR_CLIENT_SECRET: z.string().min(1),
		// Rox house model (ROX R1) — server-side shared key + optional upstream
		// model override. When ROX_AI_API_KEY is set, chat.complete can answer as
		// "ROX R1" for every user with no per-user provider key. Optional so
		// environments without the gateway configured keep validating (the
		// procedure degrades to a typed "not configured" result).
		ROX_AI_API_KEY: z.string().optional(),
		ROX_AI_MODEL: z.string().optional(),
		// Durable-streams (chat transcript store the Журнал reads). Optional so the
		// chat completion still returns a reply even when transcript persistence is
		// not configured; persistence is skipped gracefully in that case.
		DURABLE_STREAMS_URL: z.string().url().optional(),
		DURABLE_STREAMS_SECRET: z.string().min(1).optional(),
	},
	clientPrefix: "PUBLIC_",
	client: {},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
