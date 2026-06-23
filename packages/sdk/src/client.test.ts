/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

// `@types/node` isn't installed for this package and the SDK tsconfig sets
// `types: []`, so the ambient `process` global isn't visible to tsc here. We
// only touch `process.env` (a string map) in these tests, so a narrow local
// declaration is enough to typecheck without pulling in node types.
declare const process: { env: Record<string, string | undefined> };

import { Rox } from "./client";
import { RoxError } from "./core/error";
import type { FinalRequestOptions } from "./internal/request-options";

/**
 * CHARACTERIZATION TESTS — the public `Rox` client surface: construction,
 * defaults, env handling, auth-header shaping, URL building, option cloning,
 * and the tRPC envelope unwrap performed by `mutation` / `query`. These capture
 * the CURRENT behavior (network is never hit) before any error-model refactor.
 *
 * `authHeaders`, `defaultIdempotencyKey`, and `makeStatusError` are `protected`,
 * so we drive them through a tiny subclass that exposes them.
 */

class TestRox extends Rox {
	authHeadersFor(opts: FinalRequestOptions) {
		return this.authHeaders(opts);
	}
	idempotencyKey() {
		return this.defaultIdempotencyKey();
	}
}

// Env vars the constructor reads via readEnv(). We snapshot and clear them so
// tests are independent of the host environment, then restore afterwards.
const ENV_KEYS = [
	"ROX_API_KEY",
	"ROX_BASE_URL",
	"ROX_ORGANIZATION_ID",
	"ROX_RELAY_URL",
	"ROX_LOG",
	"ROX_CUSTOM_HEADERS",
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
	savedEnv = {};
	for (const k of ENV_KEYS) {
		savedEnv[k] = process.env[k];
		delete process.env[k];
	}
});

afterEach(() => {
	for (const k of ENV_KEYS) {
		if (savedEnv[k] === undefined) delete process.env[k];
		else process.env[k] = savedEnv[k];
	}
});

const opts = (): FinalRequestOptions =>
	({ method: "get", path: "/x" }) as FinalRequestOptions;

describe("Rox construction", () => {
	it("throws a RoxError when no apiKey is provided and none is in the env", () => {
		expect(() => new Rox({})).toThrow(RoxError);
		expect(() => new Rox({})).toThrow(/ROX_API_KEY/);
	});

	it("applies documented defaults", () => {
		const client = new Rox({ apiKey: "sk_test_abc" });
		expect(client.apiKey).toBe("sk_test_abc");
		expect(client.baseURL).toBe("https://api.rox.one");
		expect(client.relayURL).toBe("https://relay.rox.one");
		expect(client.timeout).toBe(Rox.DEFAULT_TIMEOUT);
		expect(client.timeout).toBe(60000);
		expect(client.maxRetries).toBe(2);
		expect(client.organizationId).toBeNull();
		expect(client.logLevel).toBe("warn");
	});

	it("reads apiKey, baseURL, organizationId, and relayURL from the env", () => {
		process.env.ROX_API_KEY = "sk_live_fromenv";
		process.env.ROX_BASE_URL = "https://api.example.com/v2/";
		process.env.ROX_ORGANIZATION_ID = "org_env";
		process.env.ROX_RELAY_URL = "https://relay.example.com";

		const client = new Rox();
		expect(client.apiKey).toBe("sk_live_fromenv");
		expect(client.baseURL).toBe("https://api.example.com/v2/");
		expect(client.organizationId).toBe("org_env");
		expect(client.relayURL).toBe("https://relay.example.com");
	});

	it("lets explicit options override the env", () => {
		process.env.ROX_API_KEY = "sk_test_env";
		const client = new Rox({ apiKey: "sk_test_explicit", maxRetries: 5 });
		expect(client.apiKey).toBe("sk_test_explicit");
		expect(client.maxRetries).toBe(5);
	});

	it("exposes the expected static error classes and timeout", () => {
		expect(Rox.DEFAULT_TIMEOUT).toBe(60000);
		expect(Rox.RoxError).toBe(RoxError);
		expect(typeof Rox.NotFoundError).toBe("function");
		expect(typeof Rox.RateLimitError).toBe("function");
	});

	it("wires up the resource namespaces", () => {
		const client = new Rox({ apiKey: "sk_test_abc" });
		expect(client.tasks).toBeInstanceOf(Rox.Tasks);
		expect(client.workspaces).toBeInstanceOf(Rox.Workspaces);
		expect(client.projects).toBeInstanceOf(Rox.Projects);
		expect(client.hosts).toBeInstanceOf(Rox.Hosts);
		expect(client.automations).toBeInstanceOf(Rox.Automations);
		expect(client.agents).toBeInstanceOf(Rox.Agents);
		expect(client.terminals).toBeInstanceOf(Rox.Terminals);
		expect(client.organization).toBeInstanceOf(Rox.Organization);
	});
});

describe("authHeaders", () => {
	it("uses x-api-key for sk_live_ keys", async () => {
		const client = new TestRox({ apiKey: "sk_live_abc" });
		const headers = await client.authHeadersFor(opts());
		expect(headers?.values.get("x-api-key")).toBe("sk_live_abc");
		expect(headers?.values.get("authorization")).toBeNull();
	});

	it("uses x-api-key for sk_test_ keys", async () => {
		const client = new TestRox({ apiKey: "sk_test_abc" });
		const headers = await client.authHeadersFor(opts());
		expect(headers?.values.get("x-api-key")).toBe("sk_test_abc");
	});

	it("uses a Bearer Authorization header for non-sk_ keys (treated as JWT)", async () => {
		const client = new TestRox({ apiKey: "jwt-token-xyz" });
		const headers = await client.authHeadersFor(opts());
		expect(headers?.values.get("authorization")).toBe("Bearer jwt-token-xyz");
		expect(headers?.values.get("x-api-key")).toBeNull();
	});

	it("includes the organization id header when organizationId is set", async () => {
		const client = new TestRox({ apiKey: "sk_live_abc", organizationId: "org_1" });
		const headers = await client.authHeadersFor(opts());
		expect(headers?.values.get("x-rox-organization-id")).toBe("org_1");
	});

	it("omits the organization id header when organizationId is absent", async () => {
		const client = new TestRox({ apiKey: "sk_live_abc" });
		const headers = await client.authHeadersFor(opts());
		expect(headers?.values.get("x-rox-organization-id")).toBeNull();
	});
});

describe("buildURL", () => {
	it("joins a relative path onto the default base URL", () => {
		const client = new Rox({ apiKey: "sk_test_abc" });
		expect(client.buildURL("/api/trpc/task.list", null)).toBe(
			"https://api.rox.one/api/trpc/task.list",
		);
	});

	it("uses an absolute path as-is (ignoring the base URL)", () => {
		const client = new Rox({ apiKey: "sk_test_abc" });
		expect(client.buildURL("https://other.example.com/foo", null)).toBe(
			"https://other.example.com/foo",
		);
	});

	it("avoids a doubled slash when base ends with / and path starts with /", () => {
		const client = new Rox({
			apiKey: "sk_test_abc",
			baseURL: "https://api.example.com/v2/",
		});
		expect(client.buildURL("/things", null)).toBe(
			"https://api.example.com/v2/things",
		);
	});

	it("appends query params", () => {
		const client = new Rox({ apiKey: "sk_test_abc" });
		const url = client.buildURL("/things", { limit: 10 });
		expect(url).toBe("https://api.rox.one/things?limit=10");
	});

	it("prefers defaultBaseURL when the base URL is not overridden", () => {
		const client = new Rox({ apiKey: "sk_test_abc" });
		const url = client.buildURL("/things", null, "https://relay.rox.one");
		expect(url).toBe("https://relay.rox.one/things");
	});

	it("ignores defaultBaseURL once the base URL has been overridden", () => {
		const client = new Rox({
			apiKey: "sk_test_abc",
			baseURL: "https://custom.example.com",
		});
		const url = client.buildURL("/things", null, "https://relay.rox.one");
		expect(url).toBe("https://custom.example.com/things");
	});
});

describe("withOptions", () => {
	it("returns a new Rox instance carrying overridden options", () => {
		const client = new Rox({ apiKey: "sk_test_abc", organizationId: "org_1" });
		const next = client.withOptions({ maxRetries: 7, organizationId: "org_2" });

		expect(next).not.toBe(client);
		expect(next).toBeInstanceOf(Rox);
		expect(next.maxRetries).toBe(7);
		expect(next.organizationId).toBe("org_2");
		// Unspecified options are inherited.
		expect(next.apiKey).toBe("sk_test_abc");
		expect(next.baseURL).toBe(client.baseURL);
		// Original is unchanged.
		expect(client.maxRetries).toBe(2);
		expect(client.organizationId).toBe("org_1");
	});
});

describe("defaultIdempotencyKey", () => {
	it("produces a unique stainless-prefixed retry key each call", () => {
		const client = new TestRox({ apiKey: "sk_test_abc" });
		const a = client.idempotencyKey();
		const b = client.idempotencyKey();
		expect(a).toMatch(/^stainless-node-retry-/);
		expect(a).not.toBe(b);
	});
});

describe("host-routed calls require an organizationId", () => {
	it("hostMutation throws a RoxError without organizationId", () => {
		const client = new Rox({ apiKey: "sk_test_abc" });
		expect(() => client.hostMutation("host_1", "workspace.create")).toThrow(
			RoxError,
		);
		expect(() => client.hostMutation("host_1", "workspace.create")).toThrow(
			/organizationId is required/,
		);
	});

	it("hostQuery throws a RoxError without organizationId", () => {
		const client = new Rox({ apiKey: "sk_test_abc" });
		expect(() => client.hostQuery("host_1", "workspace.list")).toThrow(
			/organizationId is required/,
		);
	});
});

describe("tRPC envelope unwrapping (mutation / query)", () => {
	// A fake fetch lets us assert the request shape and the SuperJSON unwrap
	// without any real network. We capture the last request for inspection.
	type Captured = { url: string; init: RequestInit };

	const makeClient = (responseJson: unknown) => {
		const captured: Captured[] = [];
		const fakeFetch = (async (url: string, init: RequestInit) => {
			captured.push({ url, init });
			return new Response(JSON.stringify(responseJson), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as unknown as typeof fetch;

		const client = new Rox({
			apiKey: "sk_test_abc",
			fetch: fakeFetch,
			maxRetries: 0,
		});
		return { client, captured };
	};

	it("mutation POSTs to /api/trpc/<proc>, wraps input in { json }, and unwraps result.data.json", async () => {
		const { client, captured } = makeClient({
			result: { data: { json: { ok: true, id: "t1" } } },
		});

		const result = await client.mutation<{ ok: boolean; id: string }>(
			"task.create",
			{ title: "hi" },
		);

		expect(result).toEqual({ ok: true, id: "t1" });
		expect(captured).toHaveLength(1);
		expect(captured[0]?.url).toBe(
			"https://api.rox.one/api/trpc/task.create",
		);
		expect(captured[0]?.init.method).toBe("POST");
		expect(JSON.parse(captured[0]?.init.body as string)).toEqual({
			json: { title: "hi" },
		});
	});

	it("mutation sends { json: null } when no input is provided", async () => {
		const { client, captured } = makeClient({
			result: { data: { json: null } },
		});
		await client.mutation("task.delete");
		expect(JSON.parse(captured[0]?.init.body as string)).toEqual({
			json: null,
		});
	});

	it("query GETs /api/trpc/<proc> with the input encoded as a json-wrapped ?input param", async () => {
		const { client, captured } = makeClient({
			result: { data: { json: [{ id: "t1" }] } },
		});

		const result = await client.query<Array<{ id: string }>>("task.list", {
			limit: 5,
		});

		expect(result).toEqual([{ id: "t1" }]);
		expect(captured[0]?.init.method).toBe("GET");
		const url = new URL(captured[0]!.url);
		expect(url.pathname).toBe("/api/trpc/task.list");
		expect(JSON.parse(url.searchParams.get("input") ?? "")).toEqual({
			json: { limit: 5 },
		});
	});

	it("query omits the input param entirely when no input is given", async () => {
		const { client, captured } = makeClient({
			result: { data: { json: [] } },
		});
		await client.query("task.statuses.list");
		const url = new URL(captured[0]!.url);
		expect(url.searchParams.has("input")).toBe(false);
	});
});
