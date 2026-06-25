import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as realDbSchema from "@rox/db/schema";

/**
 * Contract tests for the main-side `agent_run` host bridge
 * (`runAgentOnHostAndCapture`).
 *
 * The bridge is the cloud→relay→host seam: it resolves a host + workspace, mints
 * a scoped JWT, and relays `agents.runAndCapture` to the desktop host-service,
 * returning the captured output inline so the pipeline executor can thread it
 * into the accumulating context.
 *
 * A TRUE end-to-end run needs a running desktop host + DB (and a live pty /
 * chat runtime) — that is out of headless scope and is verified manually
 * post-merge. These tests instead MOCK the relay boundary (`relayMutation`),
 * the host/user DB lookups (`dbWs`), and the JWT mint (`mintUserJwt`) so we can
 * assert, deterministically and offline:
 *
 *   - the exact `agents.runAndCapture` request shape the bridge sends, and
 *   - that the host response round-trips into `RunAgentOnHostResult`
 *     (kind / sessionId / message / artifacts / workspaceId), for BOTH a chat
 *     and a terminal role.
 *
 * The pure prompt/context/error logic lives in `@rox/workflow-core` and the
 * resolver composition (output → accumulated context) is contract-tested in
 * `agent-run-service.test.ts`; this file owns the relay-transport contract.
 */

// ── Relay boundary mock ─────────────────────────────────────────────────────
// Captures every (options, procedure, input) and returns a canned output keyed
// by procedure. This is the seam a real cross-process run crosses.
interface RelayCall {
	options: {
		relayUrl: string;
		hostId: string;
		jwt: string;
		timeoutMs?: number;
	};
	procedure: string;
	input: unknown;
}
let relayCalls: RelayCall[] = [];
let relayResponders: Record<string, (input: unknown) => unknown> = {};

const relayMutationMock = mock(
	async (options: RelayCall["options"], procedure: string, input: unknown) => {
		relayCalls.push({ options, procedure, input });
		const responder = relayResponders[procedure];
		if (!responder) {
			throw new Error(`no relay responder registered for ${procedure}`);
		}
		return responder(input);
	},
);

class RelayDispatchErrorMock extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly body: string,
	) {
		super(message);
		this.name = "RelayDispatchError";
	}
}

mock.module("../automation/relay-client", () => ({
	relayMutation: relayMutationMock,
	RelayDispatchError: RelayDispatchErrorMock,
}));

// ── DB lookups mock ─────────────────────────────────────────────────────────
// The bridge runs two awaited select chains: (1) host resolution
// (select→from→innerJoin→where→orderBy→limit) and (2) owner email lookup
// (select→from→where→limit). Both are awaitable drizzle builders. We model that
// with a chainable thenable that resolves to the next queued row-set per await.
let dbResultQueue: unknown[][] = [];

function chainableQuery(): unknown {
	const builder: Record<string, unknown> = {};
	const passthrough = () => builder;
	for (const method of [
		"select",
		"from",
		"innerJoin",
		"leftJoin",
		"where",
		"orderBy",
		"groupBy",
	]) {
		builder[method] = passthrough;
	}
	// `.limit(n)` resolves the chain: pop the next queued row-set. Both bridge
	// query chains (host resolution + owner email lookup) terminate in `.limit(1)`,
	// so resolving here is sufficient — no thenable on the builder needed.
	builder.limit = async () => dbResultQueue.shift() ?? [];
	return builder;
}

const dbWsMock = { select: () => chainableQuery() };

// `mock.module` is process-global in bun and the LAST registration wins for every
// already-loaded importer. Sibling suites in this directory
// (`dispatcher.test.ts`, `run-pipeline.test.ts`) register their own conflicting
// `@rox/db/client` / `@rox/db/schema` mocks at module-eval time, and the file
// load order across the directory run is not deterministic — so whichever suite
// happened to evaluate last silently won, corrupting this suite's DB mock and
// producing order-dependent (flaky) assertion failures. Re-asserting our mocks in
// `beforeEach` makes this suite's view of `@rox/db` deterministic regardless of
// sibling load order.
function installDbMocks() {
	mock.module("@rox/db/client", () => ({
		db: dbWsMock,
		dbWs: dbWsMock,
	}));

	// Shallow column refs so `eq(...)`/`and(...)` over schema columns don't throw at
	// module load (mirrors the v2-host suite's schema mock shape).
	mock.module("@rox/db/schema", () => ({
		...realDbSchema,
		users: { id: "users.id", email: "users.email" },
		v2Hosts: {
			machineId: "v2_hosts.machine_id",
			isOnline: "v2_hosts.is_online",
			organizationId: "v2_hosts.organization_id",
			updatedAt: "v2_hosts.updated_at",
		},
		v2UsersHosts: {
			organizationId: "v2_users_hosts.organization_id",
			hostId: "v2_users_hosts.host_id",
			userId: "v2_users_hosts.user_id",
		},
	}));
}

installDbMocks();

// JWT mint: deterministic token, captured args so we can assert scope/run id.
let mintArgs: unknown;
const mintUserJwtMock = mock(async (args: unknown) => {
	mintArgs = args;
	return "jwt-test-token";
});
mock.module("@rox/auth/server", () => ({
	mintUserJwt: mintUserJwtMock,
}));

// Import AFTER mocks are registered (isolated suite: real modules would
// otherwise load + construct heavy clients / validate env).
const { runAgentOnHostAndCapture, AgentHostUnavailableError } = await import(
	"./agent-run-host-bridge"
);

function baseArgs(overrides: Record<string, unknown> = {}) {
	return {
		relayUrl: "https://relay.test",
		organizationId: "org-1",
		userId: "user-1",
		runId: "run-abcdef12-3456",
		v2ProjectId: "proj-1",
		workspaceId: "ws-existing" as string | null,
		agentKind: "chat" as "chat" | "terminal",
		agentId: "rox",
		prompt: "Ты — критик. Сверь с критерием готовности.",
		maxTurns: 4,
		label: "critic",
		...overrides,
	};
}

beforeEach(() => {
	// Re-assert our module mocks so a sibling suite's conflicting global
	// `mock.module("@rox/db/client")` (registered at its own module-eval time)
	// cannot leak into this suite depending on file load order.
	installDbMocks();
	relayCalls = [];
	relayResponders = {};
	dbResultQueue = [];
	mintArgs = undefined;
});

describe("runAgentOnHostAndCapture — relay contract", () => {
	test("BRIDGE-01: chat role round-trips host output and sends the runAndCapture request shape", async () => {
		// Host resolution row, then owner email row.
		dbResultQueue = [
			[{ machineId: "machine-A", isOnline: true }],
			[{ email: "owner@example.com" }],
		];
		relayResponders["agents.runAndCapture"] = () => ({
			kind: "chat",
			sessionId: "sess-chat-1",
			message: "approved — ship it",
		});

		const result = await runAgentOnHostAndCapture(baseArgs());

		// Response round-trips into RunAgentOnHostResult.
		expect(result).toEqual({
			kind: "chat",
			sessionId: "sess-chat-1",
			message: "approved — ship it",
			workspaceId: "ws-existing",
		});

		// Exactly one relay call (workspace was supplied → no workspaces.create).
		expect(relayCalls).toHaveLength(1);
		const call = relayCalls[0];
		expect(call?.procedure).toBe("agents.runAndCapture");
		// Request shape is the documented contract the host handler consumes.
		expect(call?.input).toEqual({
			workspaceId: "ws-existing",
			agent: "rox",
			prompt: "Ты — критик. Сверь с критерием готовности.",
			maxTurns: 4,
		});
		// Transport carries the minted JWT + a routing key derived from the host.
		expect(call?.options.jwt).toBe("jwt-test-token");
		expect(call?.options.relayUrl).toBe("https://relay.test");
		expect(typeof call?.options.hostId).toBe("string");
		expect(call?.options.hostId).toContain("machine-A");
		// JWT minted with the pipeline-run scope + run id provenance.
		expect(mintArgs).toMatchObject({
			userId: "user-1",
			email: "owner@example.com",
			organizationIds: ["org-1"],
			scope: "pipeline-run",
			runId: "run-abcdef12-3456",
		});
	});

	test("BRIDGE-02: terminal role round-trips output + artifacts", async () => {
		dbResultQueue = [
			[{ machineId: "machine-B", isOnline: true }],
			[{ email: "owner@example.com" }],
		];
		relayResponders["agents.runAndCapture"] = () => ({
			kind: "terminal",
			sessionId: "term-1",
			message: "All checks passed.",
			artifacts: [{ kind: "file", ref: "/repo/out.md" }],
		});

		const result = await runAgentOnHostAndCapture(
			baseArgs({ agentKind: "terminal", agentId: "claude" }),
		);

		expect(result.kind).toBe("terminal");
		expect(result.sessionId).toBe("term-1");
		expect(result.message).toBe("All checks passed.");
		expect(result.artifacts).toEqual([{ kind: "file", ref: "/repo/out.md" }]);
		expect(result.workspaceId).toBe("ws-existing");

		const call = relayCalls.find((c) => c.procedure === "agents.runAndCapture");
		expect(call?.input).toMatchObject({ agent: "claude", maxTurns: 4 });
	});

	test("BRIDGE-03: omits the artifacts key when the host returns none", async () => {
		dbResultQueue = [
			[{ machineId: "machine-A", isOnline: true }],
			[{ email: "owner@example.com" }],
		];
		relayResponders["agents.runAndCapture"] = () => ({
			kind: "chat",
			sessionId: "sess-2",
			message: "ok",
			artifacts: [],
		});

		const result = await runAgentOnHostAndCapture(baseArgs());
		expect("artifacts" in result).toBe(false);
	});

	test("BRIDGE-04: no workspace → creates one on the host, then runs in it", async () => {
		dbResultQueue = [
			[{ machineId: "machine-C", isOnline: true }],
			[{ email: "owner@example.com" }],
		];
		relayResponders["workspaces.create"] = () => ({
			workspace: { id: "ws-fresh" },
		});
		let capturedWorkspaceId: unknown;
		relayResponders["agents.runAndCapture"] = (input) => {
			capturedWorkspaceId = (input as { workspaceId: string }).workspaceId;
			return { kind: "chat", sessionId: "sess-3", message: "done" };
		};

		const result = await runAgentOnHostAndCapture(
			baseArgs({ workspaceId: null }),
		);

		// First relay call creates the workspace; second runs the agent in it.
		expect(relayCalls.map((c) => c.procedure)).toEqual([
			"workspaces.create",
			"agents.runAndCapture",
		]);
		const createInput = relayCalls[0]?.input as {
			projectId: string;
			name: string;
			branch: string;
		};
		expect(createInput.projectId).toBe("proj-1");
		// Readable, collision-free branch derived from label + timestamp + run id.
		expect(createInput.branch).toContain("pipe-");
		expect(createInput.branch).toContain("critic");
		// The created workspace id flows into the run + the result.
		expect(capturedWorkspaceId).toBe("ws-fresh");
		expect(result.workspaceId).toBe("ws-fresh");
	});

	test("BRIDGE-05: no host resolved → AgentHostUnavailableError, no relay call", async () => {
		dbResultQueue = [[]]; // host resolution yields nothing
		await expect(runAgentOnHostAndCapture(baseArgs())).rejects.toBeInstanceOf(
			AgentHostUnavailableError,
		);
		expect(relayCalls).toHaveLength(0);
	});

	test("BRIDGE-06: resolved host offline → AgentHostUnavailableError mentioning offline", async () => {
		dbResultQueue = [[{ machineId: "machine-D", isOnline: false }]];
		await expect(runAgentOnHostAndCapture(baseArgs())).rejects.toThrow(
			/offline/i,
		);
		expect(relayCalls).toHaveLength(0);
	});

	test("BRIDGE-07: no workspace AND no project → AgentHostUnavailableError before any relay call", async () => {
		dbResultQueue = [
			[{ machineId: "machine-E", isOnline: true }],
			[{ email: "owner@example.com" }],
		];
		await expect(
			runAgentOnHostAndCapture(
				baseArgs({ workspaceId: null, v2ProjectId: null }),
			),
		).rejects.toBeInstanceOf(AgentHostUnavailableError);
		// JWT was minted but no workspace could be created → no relay call.
		expect(relayCalls).toHaveLength(0);
	});
});
