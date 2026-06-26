import { describe, expect, test } from "bun:test";
import {
	McpServerNotFoundError,
	McpToolNotFoundError,
	ToolNotFoundError,
} from "@rox/workflow-runtime/handlers";
import {
	type McpPortDeps,
	type McpPortScope,
	type McpToolClient,
	type McpToolContext,
	type McpToolPool,
	makePipelineMcpInvoke,
	makePipelineToolInvoke,
} from "./mcp-tool-port";

/**
 * DB/network-free coverage for the tool-node ports (#545). The ports are wired
 * to Rox's existing MCP layer (`@rox/mcp-v2` AgentSourcePool) in production; here
 * the MCP-context builder and the source pool are injected as fakes so the test
 * exercises the REAL port logic — source resolution, tool-name search across
 * connected sources, argument pass-through, downstream-error mapping, and pool
 * cleanup — without a DB, a JWT mint, or a live downstream transport.
 */

const SCOPE: McpPortScope = {
	organizationId: "org-1",
	userId: "user-1",
	relayUrl: "https://relay.test",
};

const FAKE_CONTEXT: McpToolContext = {
	userId: "user-1",
	email: "u@test",
	organizationId: "org-1",
	organizationIds: ["org-1"],
	source: "oauth",
	clientLabel: "pipeline-run",
	requestId: "req-1",
	bearerToken: "jwt",
	relayUrl: "https://relay.test",
};

/** A fake downstream client with a fixed tool set and a scripted call result. */
function fakeClient(opts: {
	tools: string[];
	onCall?: (name: string, args?: Record<string, unknown>) => unknown;
	listThrows?: boolean;
}): McpToolClient {
	return {
		async listTools() {
			if (opts.listThrows) throw new Error("listTools failed");
			return { tools: opts.tools.map((name) => ({ name })) };
		},
		async callTool(params) {
			if (opts.onCall) return opts.onCall(params.name, params.arguments);
			return { ok: true, name: params.name, args: params.arguments };
		},
	};
}

/** A fake pool over a slug→client map. Records whether cleanup ran. */
function fakePool(
	bySlug: Record<string, McpToolClient>,
	failures: Record<string, Error> = {},
): McpToolPool & { cleaned: boolean } {
	const state = { cleaned: false };
	const pool: McpToolPool & { cleaned: boolean } = {
		get cleaned() {
			return state.cleaned;
		},
		async connectAll() {
			return undefined;
		},
		get(slug) {
			return bySlug[slug];
		},
		getConnected() {
			return Object.entries(bySlug).map(([slug, client]) => ({
				source: { slug },
				client,
			}));
		},
		getFailures() {
			return new Map(Object.entries(failures));
		},
		async cleanup() {
			state.cleaned = true;
		},
	};
	return pool;
}

function deps(
	pool: McpToolPool,
	buildContext: McpPortDeps["buildContext"] = async () => FAKE_CONTEXT,
): McpPortDeps {
	return { buildContext, makePool: () => pool };
}

describe("makePipelineMcpInvoke (mcp_tool)", () => {
	test("calls the named tool on the bound server and returns its result", async () => {
		const client = fakeClient({
			tools: ["create_issue"],
			onCall: (name, args) => ({ called: name, args }),
		});
		const pool = fakePool({ github: client });
		const invoke = makePipelineMcpInvoke(SCOPE, deps(pool));

		const res = await invoke({
			server: "github",
			tool: "create_issue",
			args: { title: "Bug" },
		});

		expect(res.result).toEqual({
			called: "create_issue",
			args: { title: "Bug" },
		});
		expect(pool.cleaned).toBe(true);
	});

	test("unresolved server → McpServerNotFoundError (surfaces the connect failure)", async () => {
		const pool = fakePool({}, { ghost: new Error("connection timed out") });
		const invoke = makePipelineMcpInvoke(SCOPE, deps(pool));

		await expect(
			invoke({ server: "ghost", tool: "x", args: {} }),
		).rejects.toBeInstanceOf(McpServerNotFoundError);
		expect((pool as { cleaned: boolean }).cleaned).toBe(true);
	});

	test("downstream 'unknown tool' rejection → McpToolNotFoundError", async () => {
		const client = fakeClient({
			tools: ["create_issue"],
			onCall: () => {
				throw new Error("Unknown tool: ghost");
			},
		});
		const pool = fakePool({ github: client });
		const invoke = makePipelineMcpInvoke(SCOPE, deps(pool));

		await expect(
			invoke({ server: "github", tool: "ghost", args: {} }),
		).rejects.toBeInstanceOf(McpToolNotFoundError);
	});

	test("other downstream rejection is re-thrown as-is (→ generic call failure)", async () => {
		const client = fakeClient({
			tools: ["x"],
			onCall: () => {
				throw new Error("transport down");
			},
		});
		const pool = fakePool({ github: client });
		const invoke = makePipelineMcpInvoke(SCOPE, deps(pool));

		await expect(
			invoke({ server: "github", tool: "x", args: {} }),
		).rejects.toThrow("transport down");
	});

	test("a context-build failure rejects and never connects a source", async () => {
		const pool = fakePool({ github: fakeClient({ tools: ["x"] }) });
		const invoke = makePipelineMcpInvoke(
			SCOPE,
			deps(pool, async () => {
				throw new Error("user not in org");
			}),
		);

		await expect(
			invoke({ server: "github", tool: "x", args: {} }),
		).rejects.toThrow("user not in org");
	});
});

describe("makePipelineToolInvoke (tool_call)", () => {
	test("finds the tool across connected sources and invokes it there", async () => {
		const a = fakeClient({ tools: ["alpha"] });
		const b = fakeClient({
			tools: ["send_email"],
			onCall: (name, args) => ({ via: "b", name, args }),
		});
		const pool = fakePool({ srcA: a, srcB: b });
		const invoke = makePipelineToolInvoke(SCOPE, deps(pool));

		const res = await invoke({
			toolId: "send_email",
			args: { to: "x@y.z" },
		});

		expect(res.result).toEqual({
			via: "b",
			name: "send_email",
			args: { to: "x@y.z" },
		});
		expect((pool as { cleaned: boolean }).cleaned).toBe(true);
	});

	test("unknown tool id across all sources → ToolNotFoundError", async () => {
		const pool = fakePool({ srcA: fakeClient({ tools: ["alpha"] }) });
		const invoke = makePipelineToolInvoke(SCOPE, deps(pool));

		await expect(
			invoke({ toolId: "missing", args: {} }),
		).rejects.toBeInstanceOf(ToolNotFoundError);
		expect((pool as { cleaned: boolean }).cleaned).toBe(true);
	});

	test("a source that fails to list tools is skipped, not fatal", async () => {
		const broken = fakeClient({ tools: [], listThrows: true });
		const good = fakeClient({
			tools: ["zap"],
			onCall: (name) => ({ ran: name }),
		});
		const pool = fakePool({ broken, good });
		const invoke = makePipelineToolInvoke(SCOPE, deps(pool));

		const res = await invoke({ toolId: "zap", args: {} });
		expect(res.result).toEqual({ ran: "zap" });
	});
});
