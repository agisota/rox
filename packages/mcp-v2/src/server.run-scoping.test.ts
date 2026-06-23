import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

process.env.SECRETS_ENCRYPTION_KEY ||= Buffer.alloc(32, 9).toString("base64");

// ---------------------------------------------------------------------------
// Run-scoping CONSUMER integration test.
//
// The unit suite (`agent-source-pool.run-wiring.test.ts`) proves
// `AgentSourcePool.connectSelected` resolves + attaches one source in isolation.
// This suite proves the RUNTIME CONSUMER actually routes through it: the real
// `createProxyMcpServer` (the single production seam where org sources become
// `mcp__{slug}__{tool}` proxy tools — called by the cloud
// `/api/v2/agent/[transport]` route) must, when `ctx.sourceId` is present,
// attach ONLY that selected source, and otherwise the org's whole active set.
//
// It exercises the same registration path the route uses (`createProxyMcpServer`
// -> connectSelected/connectAll -> `registerProxyTools`) and asserts the OUTCOME
// via a round-tripped `tools/list` over a real in-memory SDK client — so the
// assertion is the actual tool surface the running agent would see, not an
// internal call count.
//
// Network-free + DB-free: the org "active" list is driven through the `./caller`
// mock (the lazy import inside `resolveActiveAgentSources`, which both
// `connectAll` and `connectSelected` resolve through), and a mock connector
// stands in for the downstream transport. This is the same boundary the
// run-wiring unit test mocks; here we additionally cut it because `./server`'s
// native tools import `./caller` -> the full `@rox/trpc` AppRouter (which would
// otherwise pull the whole `@rox/db/schema` barrel into the import graph).
// ---------------------------------------------------------------------------

let listRows: Array<{
	id: string;
	slug: string;
	kind: string;
	status: string;
	endpointUrl: string | null;
	integrationConnectionId: string | null;
}> = [];
const agentSourceList = mock(async () => listRows);
mock.module("./caller", () => ({
	createMcpCaller: () => ({
		agentSource: { list: agentSourceList },
	}),
}));

// Inert leaf stubs reached transitively at import time (auth -> @rox/db/client,
// schema names used by the pool/auth graph). The run-scoping path never queries
// a real table — sources come from the `./caller` mock above.
mock.module("@rox/db/client", () => ({ db: {}, dbWs: {} }));
mock.module("@rox/db/schema", () => ({
	agentSources: {},
	members: {},
	users: {},
}));
mock.module("@rox/auth/server", () => ({
	auth: {},
	mintUserJwt: async () => "test-jwt",
}));

const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = await import(
	"@modelcontextprotocol/sdk/inMemory.js"
);
const { AgentSourcePool } = await import("./agent-source-pool");
const { createProxyMcpServer } = await import("./server");

import type { Client as McpSdkClient } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpServer as McpServerType } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
	DownstreamTool,
	McpDownstreamClient,
	ResolvedAgentSource,
} from "./agent-source-pool";
import type { McpContext } from "./auth";

function baseCtx(overrides: Partial<McpContext> = {}): McpContext {
	return {
		userId: "u1",
		email: "u1@example.com",
		organizationId: "org1",
		organizationIds: ["org1"],
		source: "api-key",
		clientLabel: null,
		requestId: "req-1",
		bearerToken: "tok",
		relayUrl: "https://relay.test",
		...overrides,
	};
}

function row(
	id: string,
	slug: string,
	status: string,
	kind = "mcp",
): (typeof listRows)[number] {
	return {
		id,
		slug,
		kind,
		status,
		endpointUrl: null,
		integrationConnectionId: null,
	};
}

/** A downstream client exposing exactly one tool named after its source slug. */
function clientWithTool(slug: string): McpDownstreamClient {
	const tools: DownstreamTool[] = [{ name: `${slug}_tool` }];
	return {
		listTools: async () => ({ tools }),
		callTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
		close: async () => {},
	};
}

/** Wire the proxy McpServer to an in-memory SDK Client so `tools/list` round-trips. */
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
				clientId: "run-scoping-test",
				scopes: ["mcp:full"],
				extra: { mcpContext: baseCtx() },
			},
		});

	await server.connect(serverTransport);
	const client = new Client({ name: "run-scoping-client", version: "1.0.0" });
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

beforeEach(() => {
	listRows = [];
	agentSourceList.mockClear();
});

afterEach(async () => {
	while (cleanups.length > 0) {
		const fn = cleanups.pop();
		if (fn) await fn();
	}
});

/** A pool that resolves via the `./caller` mock and dials via a spyable connector. */
function poolWithConnector() {
	const connector = mock(async (source: ResolvedAgentSource) =>
		clientWithTool(source.slug),
	);
	const pool = new AgentSourcePool({ connector });
	return { pool, connector };
}

async function proxyToolNames(
	ctx: McpContext,
	pool: InstanceType<typeof AgentSourcePool>,
) {
	const { server, cleanup } = await createProxyMcpServer(ctx, { pool });
	cleanups.push(cleanup);
	const { client, cleanup: clientCleanup } =
		await connectServerToClient(server);
	cleanups.push(clientCleanup);
	const { tools } = await client.listTools();
	return tools.map((t) => t.name).filter((name) => name.startsWith("mcp__"));
}

describe("createProxyMcpServer — run scoping consumes ctx.sourceId", () => {
	it("attaches ONLY the selected source's tools when ctx.sourceId is set", async () => {
		listRows = [
			row("id-a", "alpha", "active"),
			row("id-b", "beta", "active"),
			row("id-c", "gamma", "active"),
		];
		const { pool, connector } = poolWithConnector();

		const names = await proxyToolNames(baseCtx({ sourceId: "id-b" }), pool);

		// The agent sees exactly the chosen source's namespaced tool — not the
		// other two active sources. This is the dead-seam closure: the run-scoping
		// id reached the consumer and routed through connectSelected.
		expect(names).toEqual(["mcp__beta__beta_tool"]);
		// Only the selected source was dialed; alpha/gamma were never connected.
		expect(connector).toHaveBeenCalledTimes(1);
		expect(pool.get("beta")).toBeDefined();
		expect(pool.get("alpha")).toBeUndefined();
		expect(pool.get("gamma")).toBeUndefined();
	});

	it("attaches the org's whole active set when ctx.sourceId is absent", async () => {
		listRows = [
			row("id-a", "alpha", "active"),
			row("id-b", "beta", "active"),
			row("id-c", "gamma", "active"),
		];
		const { pool, connector } = poolWithConnector();

		const names = await proxyToolNames(baseCtx(), pool);

		// Default (sourceless) behaviour is unchanged: every active source attaches.
		expect(names.sort()).toEqual([
			"mcp__alpha__alpha_tool",
			"mcp__beta__beta_tool",
			"mcp__gamma__gamma_tool",
		]);
		expect(connector).toHaveBeenCalledTimes(3);
	});

	it("degrades to a sourceless run for a stale/cross-org sourceId (no proxy tools, no throw)", async () => {
		// id-missing is not in the active set -> connectSelected resolves null ->
		// nothing is attached and the run still builds successfully.
		listRows = [row("id-a", "alpha", "active")];
		const { pool, connector } = poolWithConnector();

		const names = await proxyToolNames(
			baseCtx({ sourceId: "id-missing" }),
			pool,
		);

		expect(names).toEqual([]);
		expect(connector).not.toHaveBeenCalled();
	});

	it("isolates a downstream connect failure for the selected source (run still builds)", async () => {
		listRows = [row("id-b", "beta", "active")];
		const connector = mock(async (source: ResolvedAgentSource) => {
			if (source.slug === "beta") throw new Error("connect failed");
			return clientWithTool(source.slug);
		});
		const pool = new AgentSourcePool({ connector });

		const ctx = baseCtx({ sourceId: "id-b" });
		const { server, cleanup } = await createProxyMcpServer(ctx, { pool });
		cleanups.push(cleanup);

		// The selected source failed to connect, but the proxy server is still
		// produced (the failure is isolated into pool.getFailures, exactly like the
		// connectAll path) rather than throwing out of the launch.
		expect(pool.getFailures().get("beta")?.message).toContain("connect failed");
		expect(pool.getConnected()).toHaveLength(0);

		const { client, cleanup: clientCleanup } =
			await connectServerToClient(server);
		cleanups.push(clientCleanup);
		const { tools } = await client.listTools();
		expect(
			tools.map((t) => t.name).filter((n) => n.startsWith("mcp__")),
		).toEqual([]);
	});
});
