import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	shared: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	server: {
		DATABASE_URL: z.string().url(),
		DATABASE_URL_UNPOOLED: z.string().url(),
		BLOB_READ_WRITE_TOKEN: z.string().min(1),
		GOOGLE_CLIENT_ID: z.string().min(1),
		GOOGLE_CLIENT_SECRET: z.string().min(1),
		GH_CLIENT_ID: z.string().min(1),
		GH_CLIENT_SECRET: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(1),
		LINEAR_CLIENT_ID: z.string().min(1),
		LINEAR_CLIENT_SECRET: z.string().min(1),
		LINEAR_WEBHOOK_SECRET: z.string().min(1),
		GH_APP_ID: z.string().min(1),
		GH_APP_PRIVATE_KEY: z.string().min(1),
		GH_WEBHOOK_SECRET: z.string().min(1),
		// Public slug of the GitHub App (the github.com/apps/<slug> page used for
		// the installation redirect). Must match the App's real public slug or the
		// install redirect 404s. Defaults to "rox-app".
		GH_APP_SLUG: z.string().min(1).default("rox-app"),
		SLACK_CLIENT_ID: z.string().min(1),
		SLACK_CLIENT_SECRET: z.string().min(1),
		SLACK_SIGNING_SECRET: z.string().min(1),
		// Integrations epic — new provider verticals. Optional until each
		// provider is provisioned in a given environment.
		TELEGRAM_BOT_TOKEN: z.string().optional(),
		TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
		DISCORD_CLIENT_ID: z.string().optional(),
		DISCORD_CLIENT_SECRET: z.string().optional(),
		DISCORD_PUBLIC_KEY: z.string().optional(),
		DISCORD_BOT_TOKEN: z.string().optional(),
		NOTION_CLIENT_ID: z.string().optional(),
		NOTION_CLIENT_SECRET: z.string().optional(),
		FIBERY_CLIENT_ID: z.string().optional(),
		FIBERY_CLIENT_SECRET: z.string().optional(),
		LARK_APP_ID: z.string().optional(),
		LARK_APP_SECRET: z.string().optional(),
		LARK_ENCRYPT_KEY: z.string().optional(),
		ANTHROPIC_API_KEY: z.string().min(1),
		// Rox R1 server-side generation (journal-memory epic). The ROX gateway
		// (ROX_AI_API_KEY → api.zed.md, free house model) is preferred; GROQ_API_KEY
		// is the direct groq-compound fallback. All optional so non-AI envs boot.
		GROQ_API_KEY: z.string().optional(),
		ROX_AI_API_KEY: z.string().optional(),
		ROX_AI_BASE_URL: z.string().url().optional(),
		ROX_AI_MODEL: z.string().optional(),
		QSTASH_TOKEN: z.string().min(1),
		QSTASH_URL: z.string().url(),
		QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
		QSTASH_NEXT_SIGNING_KEY: z.string().min(1),
		// Explicit, opt-in escape hatch for local development where QStash can't
		// reach localhost to sign requests. When `"true"` AND no signing keys are
		// present, queue-job routes accept unsigned bodies. Absent/any other value
		// fails closed (signature is always required). Never set this in prod.
		ALLOW_UNSIGNED_QSTASH: z.string().optional(),
		RESEND_API_KEY: z.string().min(1),
		KV_REST_API_URL: z.string().url(),
		KV_REST_API_TOKEN: z.string().min(1),
		KV_URL: z.string().url(),
		SECRETS_ENCRYPTION_KEY: z.string().min(1),
		SENTRY_AUTH_TOKEN: z.string().optional(),
		DURABLE_STREAMS_URL: z.string().url(),
		DURABLE_STREAMS_SECRET: z.string().min(1),
		TAVILY_API_KEY: z.string().optional(),
		RELAY_URL: z.string().url(),
		// dv.net crypto top-up. Disabled by default: the inbound webhook has no
		// signature verification, so it must stay off until dv.net's signing scheme
		// is wired up. Set to "true" ONLY together with that verification.
		DVNET_ENABLED: z.string().optional(),
	},
	client: {
		NEXT_PUBLIC_API_URL: z.string().url(),
		NEXT_PUBLIC_WEB_URL: z.string().url(),
		NEXT_PUBLIC_ADMIN_URL: z.string().url(),
		NEXT_PUBLIC_DESKTOP_URL: z.string().url().optional(),
		NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
		NEXT_PUBLIC_POSTHOG_HOST: z.string().url(),
		NEXT_PUBLIC_SENTRY_DSN_API: z.string().optional(),
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: z
			.enum(["development", "preview", "production"])
			.optional(),
	},
	experimental__runtimeEnv: {
		NODE_ENV: process.env.NODE_ENV,
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
		NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
		NEXT_PUBLIC_DESKTOP_URL: process.env.NEXT_PUBLIC_DESKTOP_URL,
		NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
		NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
		NEXT_PUBLIC_SENTRY_DSN_API: process.env.NEXT_PUBLIC_SENTRY_DSN_API,
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	},
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
