import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { primeRelayAffinity } from "./primeRelayAffinity";

/**
 * `primeRelayAffinity` is a pure URL-shaping helper around a single injectable
 * side effect (`global.fetch`). These tests stub `fetch` so nothing hits a real
 * server, and assert the request it builds (path rewrite to `_whoowns`,
 * protocol downgrade, preserved query, no-store cache) plus its best-effort
 * swallow-all error contract.
 */

type FetchArgs = { url: string; init: RequestInit | undefined };

const realFetch = global.fetch;

function installFetch(
	impl: (url: string, init?: RequestInit) => Promise<Response>,
): FetchArgs[] {
	const calls: FetchArgs[] = [];
	global.fetch = mock(
		(input: Parameters<typeof fetch>[0], init?: RequestInit) => {
			calls.push({ url: String(input), init });
			return impl(String(input), init);
		},
	) as unknown as typeof fetch;
	return calls;
}

describe("primeRelayAffinity", () => {
	beforeEach(() => {
		global.fetch = realFetch;
	});

	afterEach(() => {
		global.fetch = realFetch;
	});

	it("rewrites a /hosts/<id>/events WS URL to the _whoowns probe endpoint", async () => {
		const calls = installFetch(async () => new Response(null, { status: 200 }));

		await primeRelayAffinity("wss://relay.example.com/hosts/abc123/events");

		expect(calls).toHaveLength(1);
		const probed = calls[0];
		expect(probed).toBeDefined();
		if (!probed) throw new Error("no fetch call recorded");
		expect(probed.url).toBe("https://relay.example.com/hosts/abc123/_whoowns");
	});

	it("downgrades ws:// to http:// for the probe", async () => {
		const calls = installFetch(async () => new Response(null, { status: 200 }));

		await primeRelayAffinity("ws://relay.local/hosts/h1/events");

		expect(calls[0]?.url).toBe("http://relay.local/hosts/h1/_whoowns");
	});

	it("preserves the token query param so the relay can authenticate", async () => {
		const calls = installFetch(async () => new Response(null, { status: 200 }));

		await primeRelayAffinity(
			"wss://relay.example.com/hosts/abc/events?token=secret-123",
		);

		const url = new URL(String(calls[0]?.url));
		expect(url.pathname).toBe("/hosts/abc/_whoowns");
		expect(url.searchParams.get("token")).toBe("secret-123");
	});

	it("only rewrites the leading /hosts/<id> segment, not deeper paths", async () => {
		const calls = installFetch(async () => new Response(null, { status: 200 }));

		await primeRelayAffinity(
			"wss://relay.example.com/hosts/xyz/events/extra/segment",
		);

		expect(calls[0]?.url).toBe("https://relay.example.com/hosts/xyz/_whoowns");
	});

	it("issues the probe with method GET and no-store cache", async () => {
		const calls = installFetch(async () => new Response(null, { status: 200 }));

		await primeRelayAffinity("wss://relay.example.com/hosts/abc/events");

		expect(calls[0]?.init?.method).toBe("GET");
		expect(calls[0]?.init?.cache).toBe("no-store");
	});

	it("passes an AbortSignal so the probe can time out", async () => {
		const calls = installFetch(async () => new Response(null, { status: 200 }));

		await primeRelayAffinity("wss://relay.example.com/hosts/abc/events");

		expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
	});

	it("does not fetch when the URL is not a /hosts/<id>/* path", async () => {
		const calls = installFetch(async () => new Response(null, { status: 200 }));

		await primeRelayAffinity("wss://relay.example.com/events");

		expect(calls).toHaveLength(0);
	});

	it("does not fetch for a bare host root with no /hosts segment", async () => {
		const calls = installFetch(async () => new Response(null, { status: 200 }));

		await primeRelayAffinity("wss://relay.example.com/");

		expect(calls).toHaveLength(0);
	});

	it("swallows a malformed URL without throwing", async () => {
		const calls = installFetch(async () => new Response(null, { status: 200 }));

		await expect(primeRelayAffinity("not-a-url")).resolves.toBeUndefined();
		expect(calls).toHaveLength(0);
	});

	it("swallows a rejected fetch (best-effort contract)", async () => {
		installFetch(async () => {
			throw new Error("network down");
		});

		await expect(
			primeRelayAffinity("wss://relay.example.com/hosts/abc/events"),
		).resolves.toBeUndefined();
	});

	it("resolves to undefined on a successful probe", async () => {
		installFetch(async () => new Response(null, { status: 204 }));

		const result = await primeRelayAffinity(
			"wss://relay.example.com/hosts/abc/events",
		);

		expect(result).toBeUndefined();
	});
});
