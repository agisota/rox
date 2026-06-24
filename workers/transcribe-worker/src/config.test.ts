import { describe, expect, test } from "bun:test";

import { isWorkerConfigured, readConfigFromEnv } from "./config";

const FULL_ENV: Record<string, string> = {
	DEEPGRAM_API_KEY: "dg-secret",
	LIVEKIT_API_KEY: "lk-key",
	LIVEKIT_API_SECRET: "lk-secret",
	LIVEKIT_URL: "wss://sfu.livekit.cloud",
	ROX_API_URL: "https://api.rox.one",
	TRANSCRIBE_INGEST_SECRET: "ingest-secret",
};

describe("readConfigFromEnv", () => {
	test("reads a fully-configured environment", () => {
		const cfg = readConfigFromEnv(FULL_ENV);
		expect(cfg.deepgramApiKey).toBe("dg-secret");
		expect(cfg.livekit).toEqual({
			apiKey: "lk-key",
			apiSecret: "lk-secret",
			url: "wss://sfu.livekit.cloud",
		});
		expect(cfg.apiUrl).toBe("https://api.rox.one");
		expect(cfg.ingestSecret).toBe("ingest-secret");
		// Defaults for the optional tuning knobs.
		expect(cfg.model).toBe("nova-3");
		expect(cfg.language).toBe("multi");
	});

	test("falls back to NEXT_PUBLIC_LIVEKIT_URL for the SFU url", () => {
		const { LIVEKIT_URL: _omit, ...rest } = FULL_ENV;
		const cfg = readConfigFromEnv({
			...rest,
			NEXT_PUBLIC_LIVEKIT_URL: "wss://public.livekit.cloud",
		});
		expect(cfg.livekit.url).toBe("wss://public.livekit.cloud");
	});

	test("honours DEEPGRAM_MODEL / DEEPGRAM_LANGUAGE overrides", () => {
		const cfg = readConfigFromEnv({
			...FULL_ENV,
			DEEPGRAM_MODEL: "nova-2-general",
			DEEPGRAM_LANGUAGE: "ru",
		});
		expect(cfg.model).toBe("nova-2-general");
		expect(cfg.language).toBe("ru");
	});

	test.each([
		"DEEPGRAM_API_KEY",
		"LIVEKIT_API_KEY",
		"LIVEKIT_API_SECRET",
		"ROX_API_URL",
		"TRANSCRIBE_INGEST_SECRET",
	])("throws (var-name only, no secret value) when %s is missing", (key) => {
		const env: Record<string, string | undefined> = { ...FULL_ENV };
		const removed = env[key];
		env[key] = undefined;
		expect(() => readConfigFromEnv(env)).toThrow(key);
		// The thrown message must never contain the (now-removed) secret VALUE.
		try {
			readConfigFromEnv(env);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (removed) expect(msg.includes(removed)).toBe(false);
		}
	});

	test("missing SFU url throws referencing both accepted keys", () => {
		const { LIVEKIT_URL: _o, ...rest } = FULL_ENV;
		expect(() => readConfigFromEnv(rest)).toThrow(/LIVEKIT_URL/);
	});
});

describe("isWorkerConfigured", () => {
	test("true only when every required var is present", () => {
		expect(isWorkerConfigured(FULL_ENV)).toBe(true);
		const { DEEPGRAM_API_KEY: _o, ...partial } = FULL_ENV;
		expect(isWorkerConfigured(partial)).toBe(false);
	});
});
