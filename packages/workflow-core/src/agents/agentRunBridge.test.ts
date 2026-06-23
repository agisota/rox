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
	resolveAgentRunNodeConfig,
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

	test("ARB-15: node maxTurns override beats the preset (additive overrides arg)", () => {
		const preset = chatPreset({ settings: { maxTurns: 3 } });
		// No override → preset value unchanged (backward-compatible).
		expect(resolveAgentDispatchTarget(preset).maxTurns).toBe(3);
		// Override supplied → it wins, clamped through the same bounds.
		expect(resolveAgentDispatchTarget(preset, { maxTurns: 20 }).maxTurns).toBe(
			20,
		);
		// Invalid override falls back to the default, not the preset.
		expect(resolveAgentDispatchTarget(preset, { maxTurns: 0 }).maxTurns).toBe(
			DEFAULT_AGENT_MAX_TURNS,
		);
		expect(
			resolveAgentDispatchTarget(preset, { maxTurns: MAX_AGENT_MAX_TURNS + 50 })
				.maxTurns,
		).toBe(MAX_AGENT_MAX_TURNS);
	});
});

describe("resolveAgentRunNodeConfig", () => {
	test("ARB-CFG-01: undefined subBlocks → preset defaults identical to dispatch target", () => {
		const preset = chatPreset({ settings: { maxTurns: 5 } });
		const config = resolveAgentRunNodeConfig({ preset, subBlocks: undefined });
		const target = resolveAgentDispatchTarget(preset);
		// Regression lock: missing config reproduces the pre-existing dispatch shape.
		expect(config.agentKind).toBe(preset.agentKind);
		expect(config.agentId).toBe(target.agentId);
		expect(config.maxTurns).toBe(target.maxTurns);
		expect(config.maxTurns).toBe(5);
		// No node-level model/temperature → fall back to the preset (undefined here).
		expect(config.model).toBeUndefined();
		expect(config.temperature).toBeUndefined();
	});

	test("ARB-CFG-02: empty subBlocks → preset default maxTurns (8)", () => {
		const config = resolveAgentRunNodeConfig({
			preset: chatPreset(),
			subBlocks: {},
		});
		expect(config.maxTurns).toBe(DEFAULT_AGENT_MAX_TURNS);
	});

	test("ARB-CFG-03: maxTurns=20 overrides the preset", () => {
		const config = resolveAgentRunNodeConfig({
			preset: chatPreset({ settings: { maxTurns: 3 } }),
			subBlocks: { maxTurns: 20 },
		});
		expect(config.maxTurns).toBe(20);
	});

	test("ARB-CFG-04: maxTurns 0 / NaN / 9999 → default then hard cap", () => {
		const preset = chatPreset({ settings: { maxTurns: 4 } });
		expect(
			resolveAgentRunNodeConfig({ preset, subBlocks: { maxTurns: 0 } })
				.maxTurns,
		).toBe(DEFAULT_AGENT_MAX_TURNS);
		expect(
			resolveAgentRunNodeConfig({ preset, subBlocks: { maxTurns: Number.NaN } })
				.maxTurns,
		).toBe(DEFAULT_AGENT_MAX_TURNS);
		expect(
			resolveAgentRunNodeConfig({ preset, subBlocks: { maxTurns: 9999 } })
				.maxTurns,
		).toBe(MAX_AGENT_MAX_TURNS);
	});

	test("ARB-CFG-05: non-number maxTurns is ignored → preset value", () => {
		const config = resolveAgentRunNodeConfig({
			preset: chatPreset({ settings: { maxTurns: 7 } }),
			subBlocks: { maxTurns: "20" },
		});
		expect(config.maxTurns).toBe(7);
	});

	test("ARB-CFG-06: temperature clamps to [0,2]; non-number → preset", () => {
		const preset = chatPreset();
		expect(
			resolveAgentRunNodeConfig({ preset, subBlocks: { temperature: 0.7 } })
				.temperature,
		).toBe(0.7);
		expect(
			resolveAgentRunNodeConfig({ preset, subBlocks: { temperature: 5 } })
				.temperature,
		).toBe(2);
		expect(
			resolveAgentRunNodeConfig({ preset, subBlocks: { temperature: -1 } })
				.temperature,
		).toBe(0);
		expect(
			resolveAgentRunNodeConfig({ preset, subBlocks: { temperature: "0.5" } })
				.temperature,
		).toBeUndefined();
	});

	test("ARB-CFG-07: node temperature beats preset temperature", () => {
		const config = resolveAgentRunNodeConfig({
			preset: chatPreset({ settings: { temperature: 0.2 } }),
			subBlocks: { temperature: 1.5 },
		});
		expect(config.temperature).toBe(1.5);
	});

	test("ARB-CFG-08: modelOverride trims; empty falls back to preset.model", () => {
		expect(
			resolveAgentRunNodeConfig({
				preset: chatPreset(),
				subBlocks: { modelOverride: "  gpt-5  " },
			}).model,
		).toBe("gpt-5");
		// Empty/whitespace override → preset model (undefined when preset omits it).
		expect(
			resolveAgentRunNodeConfig({
				preset: chatPreset(),
				subBlocks: { modelOverride: "   " },
			}).model,
		).toBeUndefined();
		expect(
			resolveAgentRunNodeConfig({
				preset: chatPreset({ model: "rox-r1" }),
				subBlocks: { modelOverride: "" },
			}).model,
		).toBe("rox-r1");
		// Non-string override → preset model.
		expect(
			resolveAgentRunNodeConfig({
				preset: chatPreset({ model: "rox-r1" }),
				subBlocks: { modelOverride: 42 },
			}).model,
		).toBe("rox-r1");
	});

	test("ARB-CFG-09: terminal preset carries agentId + worktreeBranchPrefix", () => {
		const config = resolveAgentRunNodeConfig({
			preset: chatPreset({
				agentKind: "terminal",
				agentId: "codex",
				settings: { maxTurns: 12, worktreeBranchPrefix: "pipe" },
			}),
			subBlocks: { maxTurns: 30 },
		});
		expect(config.agentKind).toBe("terminal");
		expect(config.agentId).toBe("codex");
		expect(config.worktreeBranchPrefix).toBe("pipe");
		expect(config.maxTurns).toBe(30);
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
