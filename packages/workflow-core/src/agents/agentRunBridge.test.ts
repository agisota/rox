import { describe, expect, test } from "bun:test";
import {
	type AccumulatedContext,
	appendContextEntry,
	createAccumulatedContext,
} from "../context/accumulatedContext";
import type { AgentRolePreset } from "./agentRolePreset";
import {
	agentOutputToContextEntry,
	buildAgentRunPrompt,
	classifyAgentRunError,
	DEFAULT_AGENT_MAX_TURNS,
	MAX_AGENT_MAX_TURNS,
	ROX_AGENT_ID,
	resolveAgentDispatchTarget,
} from "./agentRunBridge";

function chatPreset(overrides: Partial<AgentRolePreset> = {}): AgentRolePreset {
	return {
		agentKind: "chat",
		agentId: ROX_AGENT_ID,
		systemPrompt: "Ты — критик.",
		skillSlugs: [],
		settings: {},
		...overrides,
	};
}

describe("buildAgentRunPrompt", () => {
	test("ARB-01: composes persona + template + rendered context in order", () => {
		const ctx = createAccumulatedContext("Сделай отчёт");
		const prompt = buildAgentRunPrompt({
			preset: { systemPrompt: "PERSONA" },
			promptTemplate: "  NODE-TEMPLATE  ",
			context: ctx,
		});
		// Persona first, node template second (trimmed), then the rendered seed.
		expect(prompt.indexOf("PERSONA")).toBeLessThan(
			prompt.indexOf("NODE-TEMPLATE"),
		);
		expect(prompt.indexOf("NODE-TEMPLATE")).toBeLessThan(
			prompt.indexOf("# Seed"),
		);
		expect(prompt).toContain("Сделай отчёт");
		// Trimmed: no leading/trailing whitespace around the node template segment.
		expect(prompt).not.toContain("  NODE-TEMPLATE  ");
	});

	test("ARB-02: drops an empty/whitespace template and empty persona", () => {
		const ctx = createAccumulatedContext("seed");
		const prompt = buildAgentRunPrompt({
			preset: { systemPrompt: "   " },
			promptTemplate: "   ",
			context: ctx,
		});
		// Only the rendered context survives.
		expect(prompt.startsWith("# Seed")).toBe(true);
		expect(prompt).not.toContain("\n\n\n");
	});

	test("ARB-03: includes the prior transcript so downstream nodes see it", () => {
		let ctx = createAccumulatedContext("seed");
		ctx = appendContextEntry(ctx, {
			nodeId: "a",
			role: "decomposer",
			agentId: ROX_AGENT_ID,
			message: "STEP-ONE-OUTPUT",
			at: "2026-01-01T00:00:00.000Z",
		});
		const prompt = buildAgentRunPrompt({
			preset: { systemPrompt: "PERSONA" },
			context: ctx,
		});
		expect(prompt).toContain("# Transcript");
		expect(prompt).toContain("STEP-ONE-OUTPUT");
		expect(prompt).toContain("decomposer");
	});
});

describe("agentOutputToContextEntry", () => {
	test("ARB-04: trims the message and carries the role/agent/node ids", () => {
		const entry = agentOutputToContextEntry({
			blockId: "node-1",
			roleSkillSlug: "critic",
			agentId: ROX_AGENT_ID,
			message: "  approved  ",
			at: "2026-01-01T00:00:00.000Z",
		});
		expect(entry).toEqual({
			nodeId: "node-1",
			role: "critic",
			agentId: ROX_AGENT_ID,
			message: "approved",
			at: "2026-01-01T00:00:00.000Z",
		});
	});

	test("ARB-05: collapses empty output to a stable placeholder", () => {
		const entry = agentOutputToContextEntry({
			blockId: "node-1",
			roleSkillSlug: "critic",
			agentId: ROX_AGENT_ID,
			message: "   ",
		});
		expect(entry.message).toBe("(no output)");
	});

	test("ARB-06: attaches artifacts only when present", () => {
		const withArtifacts = agentOutputToContextEntry({
			blockId: "n",
			roleSkillSlug: "orchestrator",
			agentId: "claude",
			message: "done",
			artifacts: [{ kind: "file", ref: "/tmp/out.md" }],
		});
		expect(withArtifacts.artifacts).toEqual([
			{ kind: "file", ref: "/tmp/out.md" },
		]);
		const withoutArtifacts = agentOutputToContextEntry({
			blockId: "n",
			roleSkillSlug: "orchestrator",
			agentId: "claude",
			message: "done",
			artifacts: [],
		});
		expect(withoutArtifacts.artifacts).toBeUndefined();
	});

	test("ARB-07: round-trips through appendContextEntry into the transcript", () => {
		const entry = agentOutputToContextEntry({
			blockId: "node-2",
			roleSkillSlug: "critic",
			agentId: ROX_AGENT_ID,
			message: "needs_work",
			at: "2026-01-01T00:00:00.000Z",
		});
		const ctx: AccumulatedContext = appendContextEntry(
			createAccumulatedContext("seed"),
			entry,
		);
		expect(ctx.entries).toHaveLength(1);
		expect(ctx.entries[0]?.message).toBe("needs_work");
	});
});

describe("resolveAgentDispatchTarget", () => {
	test("ARB-08: chat preset → chat target with preset agent id + maxTurns", () => {
		const target = resolveAgentDispatchTarget(
			chatPreset({ settings: { maxTurns: 3 } }),
		);
		expect(target).toEqual({
			kind: "chat",
			agentId: ROX_AGENT_ID,
			maxTurns: 3,
		});
	});

	test("ARB-09: terminal preset → terminal target carrying branch prefix", () => {
		const target = resolveAgentDispatchTarget(
			chatPreset({
				agentKind: "terminal",
				agentId: "codex",
				settings: { maxTurns: 12, worktreeBranchPrefix: "pipe" },
			}),
		);
		expect(target).toEqual({
			kind: "terminal",
			agentId: "codex",
			maxTurns: 12,
			worktreeBranchPrefix: "pipe",
		});
	});

	test("ARB-10: missing/invalid maxTurns falls back to the default cap", () => {
		expect(resolveAgentDispatchTarget(chatPreset()).maxTurns).toBe(
			DEFAULT_AGENT_MAX_TURNS,
		);
		expect(
			resolveAgentDispatchTarget(chatPreset({ settings: { maxTurns: -4 } }))
				.maxTurns,
		).toBe(DEFAULT_AGENT_MAX_TURNS);
		expect(
			resolveAgentDispatchTarget(
				chatPreset({ settings: { maxTurns: Number.NaN } }),
			).maxTurns,
		).toBe(DEFAULT_AGENT_MAX_TURNS);
	});

	test("ARB-10B: maxTurns is hard-capped before host dispatch", () => {
		expect(
			resolveAgentDispatchTarget(
				chatPreset({ settings: { maxTurns: MAX_AGENT_MAX_TURNS + 99 } }),
			).maxTurns,
		).toBe(MAX_AGENT_MAX_TURNS);
	});

	test("ARB-11: terminal preset with empty agentId defaults to claude", () => {
		const target = resolveAgentDispatchTarget(
			chatPreset({ agentKind: "terminal", agentId: "" }),
		);
		expect(target.kind).toBe("terminal");
		expect(target.agentId).toBe("claude");
	});
});

describe("classifyAgentRunError", () => {
	test("ARB-12: detects offline hosts from the message", () => {
		const err = classifyAgentRunError(new Error("target host offline"));
		expect(err.code).toBe("AGENT_HOST_OFFLINE");
		expect(err.message).toBe("target host offline");
	});

	test("ARB-13: detects 'no host' as unavailable", () => {
		expect(classifyAgentRunError("no host available").code).toBe(
			"AGENT_HOST_UNAVAILABLE",
		);
		expect(classifyAgentRunError(new Error("host unavailable")).code).toBe(
			"AGENT_HOST_UNAVAILABLE",
		);
	});

	test("ARB-14: falls back to the supplied code for opaque failures", () => {
		expect(classifyAgentRunError(new Error("relay 500")).code).toBe(
			"AGENT_DISPATCH_FAILED",
		);
		expect(classifyAgentRunError({}, "AGENT_NO_OUTPUT").code).toBe(
			"AGENT_NO_OUTPUT",
		);
		// Non-Error, non-string causes still yield a stable message.
		expect(classifyAgentRunError(undefined).message).toBe(
			"unknown agent_run failure",
		);
	});
});
