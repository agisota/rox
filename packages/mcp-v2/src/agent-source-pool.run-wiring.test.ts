import { beforeEach, describe, expect, it, mock } from "bun:test";

process.env.SECRETS_ENCRYPTION_KEY ||= Buffer.alloc(32, 9).toString("base64");

// ---------------------------------------------------------------------------
// Run-wiring seam test.
//
// The composer owns a `selectedSourceId` (useAgentControls) that, before this
// change, never left the hook — no run was ever scoped to the chosen source.
// `AgentSourcePool.connectSelected(ctx, sourceId)` closes that seam: it resolves
// the ONE active source for the org by id (via `resolveSelectedAgentSource`,
// which rides the same credential-free `agentSource.list` projection as the
// existing all-active path) and connects only it, reusing the same
// retry/isolation policy as `connectAll`.
//
// Network-free + DB-free: `./caller` (the lazy import inside
// `resolveActiveAgentSources`) is mocked to return controlled rows, and a mock
// connector stands in for the downstream transport. This mirrors the
// proxy-tools test style — no DB, auth, or network is touched.
// ---------------------------------------------------------------------------

// The pool's `resolveActiveAgentSources` lazy-imports `./caller`; mock it so the
// "list" returns exactly the rows we choose (including an inactive one, to prove
// status filtering) without a real tRPC AppRouter / DB.
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

// Inert leaf stubs reached transitively at import time (auth -> @rox/db/client
// `neon()`, etc.). The run-wiring path never reaches these — credentials are not
// loaded by `connectSelected` (only by the connector, which we mock).
mock.module("@rox/db/client", () => ({ db: {}, dbWs: {} }));
mock.module("@rox/db/schema", () => ({ agentSources: {} }));
mock.module("@rox/auth/server", () => ({
	auth: {},
	mintUserJwt: async () => "test-jwt",
}));

const { AgentSourcePool, resolveSelectedAgentSource } = await import(
	"./agent-source-pool"
);

import type {
	McpDownstreamClient,
	ResolvedAgentSource,
} from "./agent-source-pool";
import type { McpContext } from "./auth";

const ctx: McpContext = {
	userId: "u1",
	email: "u1@example.com",
	organizationId: "org1",
	organizationIds: ["org1"],
	source: "api-key",
	clientLabel: null,
	requestId: "req-1",
	bearerToken: "tok",
	relayUrl: "https://relay.test",
};

function mockClient(): McpDownstreamClient {
	return {
		listTools: async () => ({ tools: [] }),
		callTool: async () => ({ content: [] }),
		close: async () => {},
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

beforeEach(() => {
	listRows = [];
	agentSourceList.mockClear();
});

describe("resolveSelectedAgentSource", () => {
	it("returns the active source matching the selected id", async () => {
		listRows = [row("id-a", "alpha", "active"), row("id-b", "beta", "active")];

		const resolved = await resolveSelectedAgentSource(ctx, "id-b");

		expect(resolved).not.toBeNull();
		expect(resolved?.slug).toBe("beta");
		// credential-free projection only — no encryptedConfig leaks through.
		expect(resolved).not.toHaveProperty("encryptedConfig");
	});

	it("returns null when the id is not in the active set (status filtered)", async () => {
		// `draft` row is excluded by the active filter, so selecting it resolves to
		// nothing rather than attaching an inactive source.
		listRows = [
			row("id-a", "alpha", "active"),
			row("id-d", "draft-src", "draft"),
		];

		expect(await resolveSelectedAgentSource(ctx, "id-d")).toBeNull();
	});

	it("returns null for an unknown / cross-org id", async () => {
		listRows = [row("id-a", "alpha", "active")];

		expect(await resolveSelectedAgentSource(ctx, "id-missing")).toBeNull();
	});
});

describe("AgentSourcePool.connectSelected — run scoping", () => {
	it("connects ONLY the selected source, not the org's whole active set", async () => {
		listRows = [
			row("id-a", "alpha", "active"),
			row("id-b", "beta", "active"),
			row("id-c", "gamma", "active"),
		];
		const client = mockClient();
		const connector = mock(async () => client);
		const pool = new AgentSourcePool({ connector });

		const pooledSelected = await pool.connectSelected(ctx, "id-b");

		// Exactly one source attached — the chosen one — even though three are active.
		expect(pooledSelected?.source.slug).toBe("beta");
		expect(pool.get("beta")).toBe(client);
		expect(pool.get("alpha")).toBeUndefined();
		expect(pool.get("gamma")).toBeUndefined();
		expect(pool.getConnected().map((c) => c.source.slug)).toEqual(["beta"]);
		expect(connector).toHaveBeenCalledTimes(1);
	});

	it("attaches nothing when the selection is stale/inactive (does not fail the run)", async () => {
		listRows = [
			row("id-a", "alpha", "active"),
			row("id-x", "archived-src", "archived"),
		];
		const connector = mock(async () => mockClient());
		const pool = new AgentSourcePool({ connector });

		const result = await pool.connectSelected(ctx, "id-x");

		expect(result).toBeNull();
		// The connector is never invoked for an unresolved selection, and no source
		// is attached — the caller proceeds sourcelessly rather than throwing.
		expect(connector).not.toHaveBeenCalled();
		expect(pool.getConnected()).toHaveLength(0);
		expect(pool.getFailures().size).toBe(0);
	});

	it("isolates a downstream connect failure for the selected source", async () => {
		listRows = [row("id-b", "beta", "active")];
		const connector = mock(async (source: ResolvedAgentSource) => {
			if (source.slug === "beta") throw new Error("connect failed");
			return mockClient();
		});
		const pool = new AgentSourcePool({ connector });

		const result = await pool.connectSelected(ctx, "id-b");

		// A failed connect is isolated into getFailures(), exactly like connectAll,
		// rather than throwing out of the launch path.
		expect(result).toBeNull();
		expect(pool.getConnected()).toHaveLength(0);
		expect(pool.getFailures().get("beta")?.message).toContain("connect failed");
	});

	it("is idempotent: a re-selected, already-connected source is reused", async () => {
		listRows = [row("id-b", "beta", "active")];
		const client = mockClient();
		const connector = mock(async () => client);
		const pool = new AgentSourcePool({ connector });

		await pool.connectSelected(ctx, "id-b");
		const second = await pool.connectSelected(ctx, "id-b");

		expect(second?.source.slug).toBe("beta");
		expect(connector).toHaveBeenCalledTimes(1);
	});
});
