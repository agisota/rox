import { afterEach, describe, expect, it, mock } from "bun:test";

// Stub the heavy leaf packages reached transitively at import time
// (auth -> @rox/db/client `neon()`, @rox/auth/server -> @rox/email env
// validation, etc.). These tests inject a mock downstream client + resolver and
// never touch the DB, auth, or network — so inert module stubs are sufficient
// and keep the suite fully isolated (mirrors the trpc agentSource test style).
mock.module("@rox/db/client", () => ({ db: {}, dbWs: {} }));
mock.module("@rox/db/schema", () => ({ members: {}, users: {} }));
mock.module("@rox/auth/server", () => ({
	auth: {},
	mintUserJwt: async () => "test-jwt",
}));

const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = await import(
	"@modelcontextprotocol/sdk/inMemory.js"
);
const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
const { AgentSourcePool, createExternalDownstreamClient } = await import(
	"./agent-source-pool"
);
const { namespacedToolName, registerProxyTools, stripToolNamePrefix } =
	await import("./proxy-tools");

import type { Client as McpSdkClient } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpServer as McpServerType } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
	DownstreamTool,
	McpDownstreamClient,
	PooledAgentSource,
	ResolvedAgentSource,
} from "./agent-source-pool";
import type { McpContext } from "./auth";

// ---------------------------------------------------------------------------
// Network-free, DB-free proxy tests. A mock McpDownstreamClient stands in for
// every downstream source; the proxy server is connected to a real in-memory
// SDK Client so calls round-trip through the actual registerTool dispatch.
// ---------------------------------------------------------------------------

function resolvedSource(slug: string, kind = "mcp"): ResolvedAgentSource {
	return {
		id: `id-${slug}`,
		slug,
		kind,
		endpointUrl: null,
		integrationConnectionId: null,
	};
}

interface MockDownstream extends McpDownstreamClient {
	calls: { name: string; arguments?: Record<string, unknown> }[];
}

function mockClient(
	tools: DownstreamTool[],
	options: {
		callResult?: unknown;
		listToolsImpl?: () => Promise<{ tools: DownstreamTool[] }>;
	} = {},
): MockDownstream {
	const calls: MockDownstream["calls"] = [];
	return {
		calls,
		listTools: options.listToolsImpl ?? (async () => ({ tools })),
		callTool: async (params) => {
			calls.push(params);
			return options.callResult ?? { content: [{ type: "text", text: "ok" }] };
		},
		close: async () => {},
	};
}

function pooled(source: ResolvedAgentSource, client: McpDownstreamClient) {
	return { source, client } satisfies PooledAgentSource;
}

/** Wire a real McpServer to an in-memory SDK Client for round-trip calls. */
async function connectServerToClient(server: McpServerType): Promise<{
	client: McpSdkClient;
	cleanup: () => Promise<void>;
}> {
	const [serverTransport, clientTransport] =
		InMemoryTransport.createLinkedPair();

	const originalSend = clientTransport.send.bind(clientTransport);
	clientTransport.send = (message, sendOptions) =>
		originalSend(message, {
			...sendOptions,
			authInfo: {
				token: "internal",
				clientId: "proxy-test",
				scopes: ["mcp:full"],
				extra: {
					mcpContext: {
						userId: "u1",
						email: "u1@example.com",
						organizationId: "org1",
						organizationIds: ["org1"],
						source: "api-key" as const,
						clientLabel: null,
						requestId: "req-1",
						bearerToken: "tok",
						relayUrl: "https://relay.test",
					},
				},
			},
		});

	await server.connect(serverTransport);
	const client = new Client({ name: "proxy-test-client", version: "1.0.0" });
	await client.connect(clientTransport);
	return {
		client,
		cleanup: async () => {
			await client.close();
			await server.close();
		},
	};
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	while (cleanups.length > 0) {
		const fn = cleanups.pop();
		if (fn) await fn();
	}
});

// ---------------------------------------------------------------------------
// (c) prefix strip + namespacing — pure functions
// ---------------------------------------------------------------------------

describe("namespacedToolName / stripToolNamePrefix", () => {
	it("namespaces a tool as mcp__{slug}__{tool}", () => {
		expect(namespacedToolName("github", "create_issue")).toBe(
			"mcp__github__create_issue",
		);
	});

	it("round-trips namespace then strip back to the original name", () => {
		const namespaced = namespacedToolName("github", "create_issue");
		expect(stripToolNamePrefix("github", namespaced)).toBe("create_issue");
	});

	it("preserves an original name that itself contains the separator", () => {
		const namespaced = namespacedToolName("svc", "a__b__c");
		expect(namespaced).toBe("mcp__svc__a__b__c");
		expect(stripToolNamePrefix("svc", namespaced)).toBe("a__b__c");
	});

	it("returns null for a name outside the slug's namespace", () => {
		expect(stripToolNamePrefix("github", "mcp__linear__create")).toBeNull();
		expect(stripToolNamePrefix("github", "tasks_create")).toBeNull();
	});

	it("returns null when the original name would be empty", () => {
		expect(stripToolNamePrefix("github", "mcp__github__")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// (a) namespacing — registered names are mcp__{slug}__{tool}
// ---------------------------------------------------------------------------

describe("registerProxyTools — namespacing", () => {
	it("registers each downstream tool under its namespaced name", async () => {
		const server = new McpServer(
			{ name: "rox-v2-test", version: "0.0.0" },
			{ capabilities: { tools: {} } },
		);
		const client = mockClient([
			{ name: "create_issue", description: "Create an issue" },
			{ name: "list_issues" },
		]);

		const result = await registerProxyTools(server, [
			pooled(resolvedSource("github"), client),
		]);

		expect(result.registered).toEqual([
			"mcp__github__create_issue",
			"mcp__github__list_issues",
		]);
		expect(result.failures.size).toBe(0);
	});

	it("exposes namespaced tools over the wire via listTools", async () => {
		const server = new McpServer(
			{ name: "rox-v2-test", version: "0.0.0" },
			{ capabilities: { tools: {} } },
		);
		const client = mockClient([{ name: "create_issue" }]);
		await registerProxyTools(server, [
			pooled(resolvedSource("github"), client),
		]);

		const { client: sdkClient, cleanup } = await connectServerToClient(server);
		cleanups.push(cleanup);

		const listed = await sdkClient.listTools();
		const names = listed.tools.map((t) => t.name);
		expect(names).toContain("mcp__github__create_issue");
	});
});

// ---------------------------------------------------------------------------
// (b) proxying — call reaches mock.callTool with ORIGINAL name + arguments
// ---------------------------------------------------------------------------

describe("registerProxyTools — proxying", () => {
	it("forwards a call to the downstream client with the original name and arguments", async () => {
		const server = new McpServer(
			{ name: "rox-v2-test", version: "0.0.0" },
			{ capabilities: { tools: {} } },
		);
		const downstreamResult = {
			content: [{ type: "text", text: "issue #42 created" }],
		};
		const client = mockClient([{ name: "create_issue" }], {
			callResult: downstreamResult,
		});
		await registerProxyTools(server, [
			pooled(resolvedSource("github"), client),
		]);

		const { client: sdkClient, cleanup } = await connectServerToClient(server);
		cleanups.push(cleanup);

		const callResult = await sdkClient.callTool({
			name: "mcp__github__create_issue",
			arguments: { title: "Bug", repo: "rox" },
		});

		// Downstream received the ORIGINAL (un-prefixed) name + verbatim args.
		expect(client.calls).toHaveLength(1);
		expect(client.calls[0]).toEqual({
			name: "create_issue",
			arguments: { title: "Bug", repo: "rox" },
		});
		// The downstream result is surfaced back through the proxy tool.
		expect(JSON.stringify(callResult)).toContain("issue #42 created");
	});
});

// ---------------------------------------------------------------------------
// (d) error isolation — one bad source never blocks the others
// ---------------------------------------------------------------------------

describe("registerProxyTools — error isolation", () => {
	it("registers healthy sources even when another source's listTools throws", async () => {
		const server = new McpServer(
			{ name: "rox-v2-test", version: "0.0.0" },
			{ capabilities: { tools: {} } },
		);
		const broken = mockClient([], {
			listToolsImpl: async () => {
				throw new Error("downstream unavailable");
			},
		});
		const healthy = mockClient([{ name: "list_issues" }]);

		const result = await registerProxyTools(server, [
			pooled(resolvedSource("broken"), broken),
			pooled(resolvedSource("github"), healthy),
		]);

		expect(result.registered).toEqual(["mcp__github__list_issues"]);
		expect(result.failures.has("broken")).toBe(true);
		expect(result.failures.get("broken")?.message).toContain(
			"downstream unavailable",
		);
	});
});

// ---------------------------------------------------------------------------
// Pool isolation — a connector failure for one source is recorded, not fatal.
// ---------------------------------------------------------------------------

describe("AgentSourcePool — connection isolation", () => {
	const ctx = {
		userId: "u1",
		email: "u1@example.com",
		organizationId: "org1",
		organizationIds: ["org1"],
		source: "api-key" as const,
		clientLabel: null,
		requestId: "req-1",
		bearerToken: "tok",
		relayUrl: "https://relay.test",
	};

	it("connects healthy sources and isolates a failing connector", async () => {
		const healthy = mockClient([{ name: "t" }]);
		const connector = mock(async (source: ResolvedAgentSource) => {
			if (source.slug === "bad") throw new Error("connect failed");
			return healthy;
		});
		const pool = new AgentSourcePool({
			resolveSources: async () => [
				resolvedSource("bad"),
				resolvedSource("good"),
			],
			connector,
		});

		const connected = await pool.connectAll(ctx);

		expect(connected.map((c) => c.source.slug)).toEqual(["good"]);
		expect(pool.get("good")).toBe(healthy);
		expect(pool.get("bad")).toBeUndefined();
		expect(pool.getFailures().get("bad")?.message).toContain("connect failed");
	});

	it("is idempotent across connectAll calls and cleans up", async () => {
		const client = mockClient([{ name: "t" }]);
		const connector = mock(async () => client);
		const pool = new AgentSourcePool({
			resolveSources: async () => [resolvedSource("only")],
			connector,
		});

		await pool.connectAll(ctx);
		await pool.connectAll(ctx);
		expect(connector).toHaveBeenCalledTimes(1);

		await pool.cleanup();
		expect(pool.getConnected()).toHaveLength(0);
	});
});

// External transport guard — the contract the pool relies on to isolate a
// misconfigured source (the endpoint check runs before any network/DB access).
describe("external downstream client", () => {
	it("rejects a source with no endpointUrl", async () => {
		await expect(
			createExternalDownstreamClient(
				resolvedSource("no-endpoint", "external_http"),
				{} as McpContext,
			),
		).rejects.toThrow(/no endpointUrl/);
	});
});
