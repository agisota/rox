import path from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { z } from "zod";

config({ path: path.resolve(process.cwd(), "../../../.env"), quiet: true });

export const env = createEnv({
	server: {
		GH_CLIENT_ID: z.string(),
		GH_CLIENT_SECRET: z.string(),
		BETTER_AUTH_SECRET: z.string(),
		RESEND_API_KEY: z.string(),
		KV_REST_API_URL: z.string(),
		KV_REST_API_TOKEN: z.string(),
		// ROX-522: Yandex ID (OAuth2) via better-auth genericOAuth. Optional so
		// non-RU/local environments without Yandex creds still boot; the provider
		// is registered only when both values are present.
		YANDEX_CLIENT_ID: z.string().optional(),
		YANDEX_CLIENT_SECRET: z.string().optional(),
		// ROX-522: Telegram Login Widget. The bot token is the HMAC secret source
		// (secret_key = SHA256(token)); the username backs the widget's
		// `data-telegram-login`. Optional so the plugin registers only when set.
		TELEGRAM_BOT_TOKEN: z.string().optional(),
		TELEGRAM_BOT_USERNAME: z.string().optional(),
	},
	clientPrefix: "NEXT_PUBLIC_",
	client: {
		NEXT_PUBLIC_COOKIE_DOMAIN: z.string(),
		NEXT_PUBLIC_API_URL: z.string().url(),
		NEXT_PUBLIC_WEB_URL: z.string().url(),
		NEXT_PUBLIC_ADMIN_URL: z.string().url(),
		NEXT_PUBLIC_MARKETING_URL: z.string().url(),
		NEXT_PUBLIC_DESKTOP_URL: z.string().url().optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: true,
});
