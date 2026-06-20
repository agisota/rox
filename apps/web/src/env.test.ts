import { afterEach, beforeEach, describe, expect, test } from "bun:test";

/**
 * WS-L: assert the realtime collab/voice env keys are OPTIONAL — a build with all
 * the pre-existing required vars set but NONE of the LiveBlocks/LiveKit keys must
 * still validate (the features stay inert behind the experimental-features gate
 * until keys are provided). We import `env.ts` fresh with a minimal valid env so
 * `@t3-oss/env-nextjs` runs real validation rather than `SKIP_ENV_VALIDATION`.
 */

const REQUIRED_ENV: Record<string, string> = {
	NODE_ENV: "test",
	// vercel() preset is satisfied by absence in non-Vercel envs; only our own
	// required vars need values.
	DATABASE_URL: "postgres://user:pass@localhost:5432/db",
	DATABASE_URL_UNPOOLED: "postgres://user:pass@localhost:5432/db",
	BETTER_AUTH_SECRET: "test-secret",
	RESEND_API_KEY: "re_test",
	KV_REST_API_URL: "https://kv.example.test",
	KV_REST_API_TOKEN: "kv-token",
	ANTHROPIC_API_KEY: "sk-ant-test",
	NEXT_PUBLIC_API_URL: "https://api.example.test",
	NEXT_PUBLIC_RELAY_URL: "https://relay.example.test",
	NEXT_PUBLIC_WEB_URL: "https://web.example.test",
	NEXT_PUBLIC_MARKETING_URL: "https://marketing.example.test",
	NEXT_PUBLIC_DOCS_URL: "https://docs.example.test",
	NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
	NEXT_PUBLIC_POSTHOG_HOST: "https://posthog.example.test",
};

const REALTIME_KEYS = [
	"LIVEBLOCKS_SECRET_KEY",
	"LIVEKIT_API_KEY",
	"LIVEKIT_API_SECRET",
	"NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY",
	"NEXT_PUBLIC_LIVEKIT_URL",
] as const;

const saved = new Map<string, string | undefined>();

beforeEach(() => {
	for (const [key, value] of Object.entries(REQUIRED_ENV)) {
		saved.set(key, process.env[key]);
		process.env[key] = value;
	}
	for (const key of REALTIME_KEYS) {
		saved.set(key, process.env[key]);
		delete process.env[key];
	}
});

afterEach(() => {
	for (const [key, value] of saved) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	saved.clear();
});

describe("apps/web env — WS-L realtime keys", () => {
	test("validates with all realtime keys absent (they are optional)", async () => {
		const { env } = await import(`./env?optional-${Date.now()}`);
		expect(env.LIVEBLOCKS_SECRET_KEY).toBeUndefined();
		expect(env.LIVEKIT_API_KEY).toBeUndefined();
		expect(env.LIVEKIT_API_SECRET).toBeUndefined();
		expect(env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY).toBeUndefined();
		expect(env.NEXT_PUBLIC_LIVEKIT_URL).toBeUndefined();
	});

	test("surfaces the realtime keys when set", async () => {
		process.env.LIVEBLOCKS_SECRET_KEY = "sk_live_test";
		process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY = "pk_live_test";
		process.env.NEXT_PUBLIC_LIVEKIT_URL = "wss://rox.livekit.cloud";

		const { env } = await import(`./env?present-${Date.now()}`);
		expect(env.LIVEBLOCKS_SECRET_KEY).toBe("sk_live_test");
		expect(env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY).toBe("pk_live_test");
		expect(env.NEXT_PUBLIC_LIVEKIT_URL).toBe("wss://rox.livekit.cloud");
	});
});
