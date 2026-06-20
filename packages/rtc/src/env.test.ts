import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
	isLivekitClientEnabled,
	isLivekitServerEnabled,
	requireLivekitServerCredentials,
	resolveLivekitEnv,
} from "./env";

const KEYS = [
	"LIVEKIT_API_KEY",
	"LIVEKIT_API_SECRET",
	"NEXT_PUBLIC_LIVEKIT_URL",
];

let original: Record<string, string | undefined>;

beforeEach(() => {
	original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
	for (const k of KEYS) {
		delete process.env[k];
	}
});

afterEach(() => {
	for (const k of KEYS) {
		const v = original[k];
		if (v === undefined) {
			delete process.env[k];
		} else {
			process.env[k] = v;
		}
	}
});

describe("@rox/rtc env", () => {
	test("resolves to undefined when nothing is set", () => {
		const env = resolveLivekitEnv();
		expect(env.apiKey).toBeUndefined();
		expect(env.apiSecret).toBeUndefined();
		expect(env.url).toBeUndefined();
		expect(isLivekitServerEnabled(env)).toBe(false);
		expect(isLivekitClientEnabled(env)).toBe(false);
	});

	test("server is enabled only when BOTH key and secret are present", () => {
		process.env.LIVEKIT_API_KEY = "api_key";
		expect(isLivekitServerEnabled(resolveLivekitEnv())).toBe(false);
		process.env.LIVEKIT_API_SECRET = "api_secret";
		expect(isLivekitServerEnabled(resolveLivekitEnv())).toBe(true);
	});

	test("client is enabled when the public URL is present", () => {
		process.env.NEXT_PUBLIC_LIVEKIT_URL = "wss://x.livekit.cloud";
		expect(isLivekitClientEnabled(resolveLivekitEnv())).toBe(true);
	});

	test("requireLivekitServerCredentials throws when missing, returns when present", () => {
		expect(() => requireLivekitServerCredentials()).toThrow(/LIVEKIT_API_KEY/);
		process.env.LIVEKIT_API_KEY = "k";
		process.env.LIVEKIT_API_SECRET = "s";
		expect(requireLivekitServerCredentials()).toEqual({
			apiKey: "k",
			apiSecret: "s",
		});
	});
});
