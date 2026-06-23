import { describe, expect, test } from "bun:test";
import {
	type AgentRolePreset,
	createAccumulatedContext,
} from "@rox/workflow-core";
import type { AgentRunRequest } from "@rox/workflow-runtime";
import type { RunAgentOnHostResult } from "./agent-run-host-bridge";
import {
	type LoadRolePresetPort,
	makeAgentRunResolver,
	type RunAgentOnHostPort,
} from "./agent-run-service";

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
