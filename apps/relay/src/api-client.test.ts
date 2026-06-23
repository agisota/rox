import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import SuperJSON from "superjson";

// `./env` validates `process.env` at import time. Set the minimum required
// vars BEFORE importing anything that pulls in `./env` so the offline test
// never depends on a real environment or hits validation errors.
const API_URL = "https://api.test.local";
process.env.NEXT_PUBLIC_API_URL = API_URL;
process.env.KV_REST_API_URL = "https://kv.test.local";
process.env.KV_REST_API_TOKEN = "test-token";

const { createApiClient } = await import("./api-client");

interface CapturedRequest {
	url: string;
	method: string;
	headers: Headers;
	body: string | null;
}

const realFetch = globalThis.fetch;
let captured: CapturedRequest[] = [];

/**
 * Builds a tRPC v11 SuperJSON batch response. The client unwraps each entry's
 * `result.data` through the SuperJSON transformer, so we serialize the payload
 * the same way the real server would.
 */
function batchResponse(payloads: unknown[]): Response {
	const body = payloads.map((payload) => ({
		result: { data: SuperJSON.serialize(payload) },
	}));
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

beforeEach(() => {
	captured = [];
	globalThis.fetch = (async (
		input: string | URL | Request,
		init?: RequestInit,
	): Promise<Response> => {
		const req =
			input instanceof Request ? input : new Request(input.toString(), init);
		captured.push({
			url: req.url,
			method: req.method,
			headers: req.headers,
			body: req.method === "GET" ? null : await req.text(),
		});
		return batchResponse([{ allowed: true }]);
		// biome-ignore lint/suspicious/noExplicitAny: test fetch stub
	}) as any;
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

/** Returns the Nth captured request, asserting it exists first. */
function requestAt(index: number): CapturedRequest {
	const req = captured[index];
	if (!req) throw new Error(`no captured request at index ${index}`);
	return req;
}

describe("createApiClient", () => {
	it("targets the configured API tRPC endpoint", async () => {
		const client = createApiClient("jwt-abc");
		await client.host.checkAccess.query({ hostId: "host-1" });

		expect(captured).toHaveLength(1);
		const url = new URL(requestAt(0).url);
		expect(`${url.origin}${url.pathname}`).toBe(
			`${API_URL}/api/trpc/host.checkAccess`,
		);
	});

	it("attaches the bearer token from the per-call argument", async () => {
		const client = createApiClient("jwt-xyz");
		await client.host.checkAccess.query({ hostId: "host-2" });

		expect(requestAt(0).headers.get("authorization")).toBe("Bearer jwt-xyz");
	});

	it("uses a fresh token per client instance (header is computed per request)", async () => {
		await createApiClient("token-one").host.checkAccess.query({
			hostId: "h",
		});
		await createApiClient("token-two").host.checkAccess.query({
			hostId: "h",
		});

		expect(requestAt(0).headers.get("authorization")).toBe("Bearer token-one");
		expect(requestAt(1).headers.get("authorization")).toBe("Bearer token-two");
	});

	it("encodes the query input through the SuperJSON transformer", async () => {
		const client = createApiClient("jwt-abc");
		await client.host.checkAccess.query({ hostId: "host-shape" });

		// tRPC batch GET carries the SuperJSON-encoded input in `?input=`.
		const url = new URL(requestAt(0).url);
		const inputParam = url.searchParams.get("input");
		expect(inputParam).not.toBeNull();
		const decoded = SuperJSON.deserialize(
			JSON.parse(inputParam as string)["0"],
		) as { hostId: string };
		expect(decoded.hostId).toBe("host-shape");
	});

	it("decodes the SuperJSON-wrapped response payload", async () => {
		const client = createApiClient("jwt-abc");
		const result = await client.host.checkAccess.query({ hostId: "host-1" });

		expect(result).toEqual({ allowed: true });
	});

	it("issues queries as HTTP GET batches", async () => {
		const client = createApiClient("jwt-abc");
		await client.host.checkAccess.query({ hostId: "host-1" });

		expect(requestAt(0).method).toBe("GET");
		expect(new URL(requestAt(0).url).searchParams.get("batch")).toBe("1");
	});
});
