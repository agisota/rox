import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
	DEFAULT_STREAM_TOKEN_TTL_SECONDS,
	isDeepgramStreamConfigured,
	mintDeepgramStreamToken,
	resolveDeepgramKey,
} from "./deepgram-token";

const KEY = "dg-secret-key-do-not-leak";
const ACCESS_TOKEN = "eyJhbGci.minted.jwt";

let savedKey: string | undefined;

beforeEach(() => {
	savedKey = process.env.DEEPGRAM_API_KEY;
});

afterEach(() => {
	if (savedKey === undefined) delete process.env.DEEPGRAM_API_KEY;
	else process.env.DEEPGRAM_API_KEY = savedKey;
});

/** A captured-request fake `fetch` returning a scripted grant response. */
function fakeFetch(
	impl: (url: string, init: RequestInit) => Response,
	calls: { url: string; init: RequestInit }[],
): typeof fetch {
	return (async (url: unknown, init: unknown) => {
		const u = String(url);
		const i = (init ?? {}) as RequestInit;
		calls.push({ url: u, init: i });
		return impl(u, i);
	}) as unknown as typeof fetch;
}

describe("resolveDeepgramKey / isDeepgramStreamConfigured", () => {
	test("resolves a trimmed key and reports configured", () => {
		process.env.DEEPGRAM_API_KEY = `  ${KEY}  `;
		expect(resolveDeepgramKey()).toBe(KEY);
		expect(isDeepgramStreamConfigured()).toBe(true);
	});

	test("returns null and reports not-configured when unset", () => {
		delete process.env.DEEPGRAM_API_KEY;
		expect(resolveDeepgramKey()).toBeNull();
		expect(isDeepgramStreamConfigured()).toBe(false);
	});

	test("treats a blank key as not-configured", () => {
		process.env.DEEPGRAM_API_KEY = "   ";
		expect(resolveDeepgramKey()).toBeNull();
		expect(isDeepgramStreamConfigured()).toBe(false);
	});
});

describe("mintDeepgramStreamToken", () => {
	test("mints a token + expiresAt from a successful grant", async () => {
		process.env.DEEPGRAM_API_KEY = KEY;
		const calls: { url: string; init: RequestInit }[] = [];
		const fetchImpl = fakeFetch(
			() =>
				new Response(
					JSON.stringify({ access_token: ACCESS_TOKEN, expires_in: 300 }),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			calls,
		);

		const result = await mintDeepgramStreamToken({
			fetchImpl,
			now: () => 1_000_000,
		});

		expect(result.token).toBe(ACCESS_TOKEN);
		// expiresAt = now + expires_in*1000 = 1_000_000 + 300_000.
		expect(result.expiresAt).toBe(1_300_000);

		// POSTs to the documented grant endpoint with the `Token <key>` scheme.
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("https://api.deepgram.com/v1/auth/grant");
		expect(calls[0]?.init.method).toBe("POST");
		const headers = calls[0]?.init.headers as Record<string, string>;
		expect(headers.Authorization).toBe(`Token ${KEY}`);
		// Default TTL is sent in the body.
		expect(calls[0]?.init.body).toBe(
			JSON.stringify({ ttl_seconds: DEFAULT_STREAM_TOKEN_TTL_SECONDS }),
		);
	});

	test("clamps a requested TTL into Deepgram's supported range", async () => {
		process.env.DEEPGRAM_API_KEY = KEY;
		const calls: { url: string; init: RequestInit }[] = [];
		const fetchImpl = fakeFetch(
			() =>
				new Response(JSON.stringify({ access_token: ACCESS_TOKEN }), {
					status: 200,
				}),
			calls,
		);

		// 99999 is above the 3600 ceiling → clamped to 3600.
		await mintDeepgramStreamToken({ ttlSeconds: 99_999, fetchImpl });
		expect(calls[0]?.init.body).toBe(JSON.stringify({ ttl_seconds: 3600 }));
	});

	test("falls back to the requested TTL for expiresAt when expires_in is absent", async () => {
		process.env.DEEPGRAM_API_KEY = KEY;
		const calls: { url: string; init: RequestInit }[] = [];
		const fetchImpl = fakeFetch(
			() =>
				new Response(JSON.stringify({ access_token: ACCESS_TOKEN }), {
					status: 200,
				}),
			calls,
		);

		const result = await mintDeepgramStreamToken({
			ttlSeconds: 120,
			fetchImpl,
			now: () => 0,
		});
		expect(result.expiresAt).toBe(120 * 1000);
	});

	test("throws (fail-closed) and never calls fetch when the key is unset", async () => {
		delete process.env.DEEPGRAM_API_KEY;
		const calls: { url: string; init: RequestInit }[] = [];
		const fetchImpl = fakeFetch(
			() => new Response("{}", { status: 200 }),
			calls,
		);

		await expect(mintDeepgramStreamToken({ fetchImpl })).rejects.toThrow(
			/DEEPGRAM_API_KEY is not configured/,
		);
		// Fail-closed BEFORE any network call.
		expect(calls).toHaveLength(0);
	});

	test("throws on a non-2xx grant WITHOUT leaking the key", async () => {
		process.env.DEEPGRAM_API_KEY = KEY;
		const calls: { url: string; init: RequestInit }[] = [];
		const fetchImpl = fakeFetch(
			() => new Response("invalid key", { status: 401 }),
			calls,
		);

		const err = await mintDeepgramStreamToken({ fetchImpl }).catch((e) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toContain("401");
		// The thrown error must NOT echo the real key.
		expect((err as Error).message).not.toContain(KEY);
	});

	test("throws when the grant returns no access_token", async () => {
		process.env.DEEPGRAM_API_KEY = KEY;
		const calls: { url: string; init: RequestInit }[] = [];
		const fetchImpl = fakeFetch(
			() => new Response(JSON.stringify({ expires_in: 300 }), { status: 200 }),
			calls,
		);

		await expect(mintDeepgramStreamToken({ fetchImpl })).rejects.toThrow(
			/no access_token/,
		);
	});
});
