import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	type AgentRolePreset,
	createAccumulatedContext,
} from "@rox/workflow-core";
import type { AgentRunRequest } from "@rox/workflow-runtime";
// Type-only imports are erased by bun and never trigger module loading, so they
// are safe to keep static even though the value import below is deferred.
import type { RunAgentOnHostResult } from "./agent-run-host-bridge";
import type {
	LoadRolePresetPort,
	RunAgentOnHostPort,
} from "./agent-run-service";

/**
 * This suite exercises `makeAgentRunResolver` purely through injected ports
 * (`loadRolePreset` / `runOnHost`) — it never issues a DB query, mints a JWT, or
 * crosses the relay. But importing `./agent-run-service` transitively pulls in
 * `./agent-run-host-bridge`, which imports `@rox/db/client` (constructs DB
 * clients) and `@rox/auth/server` (which in turn loads `@rox/email`, validating
 * `NEXT_PUBLIC_MARKETING_URL` at module load). In a headless run without those
 * env vars / a DB, those eager imports throw at load time — and because
 * `mock.module` is process-global with nondeterministic file load order across
 * the directory, whether the throw surfaced here depended on which sibling suite
 * loaded first (an order-dependent / flaky failure).
 *
 * Stubbing those heavy transitive boundaries (none of which this DI suite uses)
 * makes the import side-effect-free and the suite deterministic. Mirrors the
 * boundary stubs in `agent-run-host-bridge.test.ts`.
 */
function installBoundaryMocks() {
	mock.module("@rox/db/client", () => ({ db: {}, dbWs: {} }));
	mock.module("@rox/auth/server", () => ({
		mintUserJwt: async () => "jwt-test-token",
	}));
	mock.module("../automation/relay-client", () => ({
		relayMutation: async () => ({}),
		RelayDispatchError: class extends Error {},
	}));
}

installBoundaryMocks();

const { makeAgentRunResolver } = await import("./agent-run-service");

const CHAT_PRESET: AgentRolePreset = {
	agentKind: "chat",
	agentId: "rox",
	systemPrompt: "Ты — критик.",
	skillSlugs: [],
	settings: { maxTurns: 2 },
};

function req(overrides: Partial<AgentRunRequest> = {}): AgentRunRequest {
	return {
		blockId: "node-1",
		roleSkillSlug: "critic",
		input: {},
		context: createAccumulatedContext("Сделай отчёт"),
		...overrides,
	};
}

function makeResolver(opts: {
	loadRolePreset: LoadRolePresetPort;
	runOnHost: RunAgentOnHostPort;
	initialWorkspaceId?: string | null;
}) {
	return makeAgentRunResolver({
		organizationId: "org-1",
		userId: "user-1",
		v2ProjectId: "proj-1",
		relayUrl: "https://relay.test",
		runId: "run-1",
		initialWorkspaceId: opts.initialWorkspaceId ?? null,
		ports: {
			loadRolePreset: opts.loadRolePreset,
			runOnHost: opts.runOnHost,
		},
	});
}

beforeEach(() => {
	// Re-assert our boundary stubs so a sibling suite's conflicting global
	// `mock.module(...)` cannot leak in via nondeterministic file load order.
	installBoundaryMocks();
});

describe("makeAgentRunResolver composition", () => {
	test("ARS-01: missing role → AGENT_ROLE_NOT_FOUND, host never called", async () => {
		let hostCalls = 0;
		const resolve = makeResolver({
			loadRolePreset: async () => null,
			runOnHost: async () => {
				hostCalls++;
				return {} as RunAgentOnHostResult;
			},
		});
		const res = await resolve(req());
		expect(res.error?.code).toBe("AGENT_ROLE_NOT_FOUND");
		expect(hostCalls).toBe(0);
	});

	test("ARS-02: builds the prompt from persona + template + transcript and maps output to context", async () => {
		let seenPrompt = "";
		let seenAgentKind = "";
		const resolve = makeResolver({
			loadRolePreset: async () => ({ preset: CHAT_PRESET }),
			runOnHost: async (a) => {
				seenPrompt = a.prompt;
				seenAgentKind = a.agentKind;
				return {
					kind: "chat",
					sessionId: "sess-1",
					message: "  approved — ship it  ",
					workspaceId: "ws-created",
				};
			},
		});
		const res = await resolve(
			req({ promptTemplate: "Сверь с критерием готовности." }),
		);

		// Prompt composed from the role persona, the node template, and the seed.
		expect(seenPrompt).toContain("Ты — критик.");
		expect(seenPrompt).toContain("Сверь с критерием готовности.");
		expect(seenPrompt).toContain("Сделай отчёт");
		// chat preset → chat dispatch.
		expect(seenAgentKind).toBe("chat");
		// Output message trimmed; context entry carries node/role/agent ids.
		expect(res.output?.message).toBe("approved — ship it");
		expect(res.appendedContext).toHaveLength(1);
		expect(res.appendedContext?.[0]).toMatchObject({
			nodeId: "node-1",
			role: "critic",
			agentId: "rox",
			message: "approved — ship it",
		});
		// childRunRef threads the spawned session through.
		expect(res.childRunRef).toEqual({ kind: "chat", sessionId: "sess-1" });
	});

	test("ARS-03: reuses the workspace created by the first node for later nodes", async () => {
		const seenWorkspaceIds: (string | null)[] = [];
		const resolve = makeResolver({
			loadRolePreset: async () => ({ preset: CHAT_PRESET }),
			runOnHost: async (a) => {
				seenWorkspaceIds.push(a.workspaceId);
				return {
					kind: "chat",
					sessionId: "sess",
					message: "ok",
					// First call "creates" ws-1; the resolver should reuse it next.
					workspaceId: "ws-1",
				};
			},
		});
		await resolve(req({ blockId: "a" }));
		await resolve(req({ blockId: "b" }));
		expect(seenWorkspaceIds[0]).toBeNull();
		expect(seenWorkspaceIds[1]).toBe("ws-1");
	});

	test("ARS-04: host failure is classified (offline → AGENT_HOST_OFFLINE)", async () => {
		const resolve = makeResolver({
			loadRolePreset: async () => ({ preset: CHAT_PRESET }),
			runOnHost: async () => {
				throw new Error("target host offline");
			},
		});
		const res = await resolve(req());
		expect(res.error?.code).toBe("AGENT_HOST_OFFLINE");
	});

	test("ARS-05: opaque host failure → AGENT_DISPATCH_FAILED", async () => {
		const resolve = makeResolver({
			loadRolePreset: async () => ({ preset: CHAT_PRESET }),
			runOnHost: async () => {
				throw new Error("relay 500: boom");
			},
		});
		const res = await resolve(req());
		expect(res.error?.code).toBe("AGENT_DISPATCH_FAILED");
	});

	test("ARS-06: empty capture → AGENT_NO_OUTPUT with childRunRef preserved", async () => {
		const resolve = makeResolver({
			loadRolePreset: async () => ({ preset: CHAT_PRESET }),
			runOnHost: async () => ({
				kind: "chat",
				sessionId: "sess-empty",
				message: "   ",
				workspaceId: "ws-1",
			}),
		});
		const res = await resolve(req());
		expect(res.error?.code).toBe("AGENT_NO_OUTPUT");
		expect(res.childRunRef).toEqual({ kind: "chat", sessionId: "sess-empty" });
		expect(res.appendedContext).toBeUndefined();
	});

	test("ARS-08: per-node maxTurns override reaches runOnHost (not just the preset)", async () => {
		let seenMaxTurns = -1;
		const resolve = makeResolver({
			loadRolePreset: async () => ({ preset: CHAT_PRESET }), // preset maxTurns: 2
			runOnHost: async (a) => {
				seenMaxTurns = a.maxTurns;
				return {
					kind: "chat",
					sessionId: "sess",
					message: "ok",
					workspaceId: "ws-1",
				};
			},
		});
		// The node overrides maxTurns; the resolver must merge it over the preset.
		await resolve(req({ maxTurns: 25 }));
		expect(seenMaxTurns).toBe(25);
	});

	test("ARS-09: no maxTurns override → preset value reaches runOnHost (regression)", async () => {
		let seenMaxTurns = -1;
		const resolve = makeResolver({
			loadRolePreset: async () => ({ preset: CHAT_PRESET }), // preset maxTurns: 2
			runOnHost: async (a) => {
				seenMaxTurns = a.maxTurns;
				return {
					kind: "chat",
					sessionId: "sess",
					message: "ok",
					workspaceId: "ws-1",
				};
			},
		});
		await resolve(req());
		expect(seenMaxTurns).toBe(2);
	});

	test("ARS-10: per-node modelOverride + temperature reach runOnHost (#527 transport)", async () => {
		let seenModel: string | undefined = "UNSET";
		let seenTemp: number | undefined = -1;
		const resolve = makeResolver({
			loadRolePreset: async () => ({ preset: CHAT_PRESET }),
			runOnHost: async (a) => {
				seenModel = a.model;
				seenTemp = a.temperature;
				return {
					kind: "chat",
					sessionId: "sess",
					message: "ok",
					workspaceId: "ws-1",
				};
			},
		});
		// The node overrides model + temperature; previously these were resolved but
		// dropped at the relay — now they must be transported to the host bridge.
		await resolve(
			req({ modelOverride: "anthropic/claude-x", temperature: 0.4 }),
		);
		expect(seenModel).toBe("anthropic/claude-x");
		expect(seenTemp).toBe(0.4);
	});

	test("ARS-11: no model/temperature override → none sent (preset has none)", async () => {
		// CHAT_PRESET declares neither model nor temperature, so with no node override
		// the resolver sends neither — the host keeps its runtime default (regression
		// guard that the additive transport stays additive).
		let modelKeyPresent = true;
		let tempKeyPresent = true;
		const resolve = makeResolver({
			loadRolePreset: async () => ({ preset: CHAT_PRESET }),
			runOnHost: async (a) => {
				modelKeyPresent = "model" in a;
				tempKeyPresent = "temperature" in a;
				return {
					kind: "chat",
					sessionId: "sess",
					message: "ok",
					workspaceId: "ws-1",
				};
			},
		});
		await resolve(req());
		expect(modelKeyPresent).toBe(false);
		expect(tempKeyPresent).toBe(false);
	});

	test("ARS-07: terminal preset dispatches as terminal and carries artifacts", async () => {
		const resolve = makeResolver({
			loadRolePreset: async () => ({
				preset: {
					...CHAT_PRESET,
					agentKind: "terminal",
					agentId: "claude",
				},
			}),
			runOnHost: async (a) => {
				expect(a.agentKind).toBe("terminal");
				expect(a.agentId).toBe("claude");
				return {
					kind: "terminal",
					sessionId: "term-1",
					message: "done",
					artifacts: [{ kind: "file", ref: "/repo/out.md" }],
					workspaceId: "ws-1",
				};
			},
		});
		const res = await resolve(req());
		expect(res.output?.artifacts).toEqual([
			{ kind: "file", ref: "/repo/out.md" },
		]);
		expect(res.appendedContext?.[0]?.artifacts).toEqual([
			{ kind: "file", ref: "/repo/out.md" },
		]);
		expect(res.childRunRef).toEqual({ kind: "terminal", sessionId: "term-1" });
	});
});
