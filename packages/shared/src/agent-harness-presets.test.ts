import { describe, expect, it } from "bun:test";
import {
	AGENT_HARNESS_PRESETS,
	getHarnessPresetById,
	getHarnessTerminalPresetBaseAgentIds,
	getInstallableHarnessPresets,
	harnessBaseAgentsAreValid,
} from "./agent-harness-presets";

describe("agent-harness-presets", () => {
	it("exposes a non-empty catalog with unique ids", () => {
		expect(AGENT_HARNESS_PRESETS.length).toBeGreaterThan(0);
		const ids = AGENT_HARNESS_PRESETS.map((preset) => preset.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("points every harness at a real base terminal agent", () => {
		expect(harnessBaseAgentsAreValid()).toBe(true);
	});

	it("marks harnesses without an install command optional", () => {
		for (const preset of AGENT_HARNESS_PRESETS) {
			if (preset.install.length === 0) {
				expect(preset.optional).toBe(true);
			}
		}
	});

	it("ships audit receipts for every harness", () => {
		for (const preset of AGENT_HARNESS_PRESETS) {
			expect(["npm", "manual", "unknown"]).toContain(preset.audit.source);
			expect(preset.audit.license.length).toBeGreaterThan(0);
			expect(["low", "medium", "unknown"]).toContain(preset.audit.sizeRisk);
			expect(["base-agent", "unsupported"]).toContain(
				preset.audit.terminalPresetStrategy,
			);
			expect(preset.audit.notes.length).toBeGreaterThan(0);
		}
	});

	it("documents terminal preset support through base agents for target harnesses", () => {
		expect(getHarnessTerminalPresetBaseAgentIds()).toMatchObject({
			"oh-my-claudecode": "claude",
			"oh-my-codex": "codex",
			"oh-my-openagent": "opencode",
			hermes: "claude",
			openclaw: "claude",
			ouroboros: "codex",
		});
	});

	it("returns only non-optional, installable harnesses from the helper", () => {
		const installable = getInstallableHarnessPresets();
		expect(installable.length).toBeGreaterThan(0);
		for (const preset of installable) {
			expect(preset.optional).not.toBe(true);
			expect(preset.install.length).toBeGreaterThan(0);
		}
	});

	it("looks up a preset by id", () => {
		const preset = getHarnessPresetById("oh-my-claudecode");
		expect(preset?.baseAgentId).toBe("claude");
		expect(getHarnessPresetById("does-not-exist")).toBeUndefined();
	});

	it("layers Rox and Open Dynamic Workflows on top of OMP", () => {
		expect(getHarnessPresetById("rox")?.baseAgentId).toBe("omp");
		expect(getHarnessPresetById("open-dynamic-workflows-omp")).toMatchObject({
			baseAgentId: "omp",
			configFiles: [
				{
					path: ".config/odw/config.json",
					overwrite: false,
					templateRef: "open-dynamic-workflows-omp",
				},
			],
			optional: true,
		});
	});
});
