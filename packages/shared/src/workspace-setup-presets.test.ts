import { describe, expect, it } from "bun:test";
import {
	getWorkspaceSetupPresetById,
	resolveWorkspaceSetupPresets,
	WORKSPACE_SETUP_PRESETS,
} from "./workspace-setup-presets";

describe("workspace-setup-presets", () => {
	it("exposes 15-30 presets with unique ids", () => {
		expect(WORKSPACE_SETUP_PRESETS.length).toBeGreaterThanOrEqual(15);
		expect(WORKSPACE_SETUP_PRESETS.length).toBeLessThanOrEqual(30);
		const ids = WORKSPACE_SETUP_PRESETS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("gives every preset a label, description, and some effect", () => {
		for (const preset of WORKSPACE_SETUP_PRESETS) {
			expect(preset.label.length).toBeGreaterThan(0);
			expect(preset.description.length).toBeGreaterThan(0);
			const hasCommands = (preset.setupCommands?.length ?? 0) > 0;
			const hasFiles = (preset.scaffoldFiles?.length ?? 0) > 0;
			expect(hasCommands || hasFiles).toBe(true);
		}
	});

	it("looks up presets by id", () => {
		expect(getWorkspaceSetupPresetById("git-init")?.label).toBe(
			"Initialize git",
		);
		expect(getWorkspaceSetupPresetById("does-not-exist")).toBeUndefined();
	});

	it("resolves selected ids into commands and files in catalog order", () => {
		const { setupCommands, scaffoldFiles } = resolveWorkspaceSetupPresets([
			"agents-md",
			"git-init",
		]);
		expect(setupCommands).toEqual(["git init"]);
		expect(scaffoldFiles.map((f) => f.path)).toEqual(["AGENTS.md"]);
	});

	it("ignores unknown ids and de-duplicates file paths", () => {
		const { scaffoldFiles } = resolveWorkspaceSetupPresets([
			"agents-md",
			"agents-md",
			"unknown-id",
		]);
		expect(scaffoldFiles).toHaveLength(1);
	});

	it("returns empty results for an empty selection", () => {
		const { setupCommands, scaffoldFiles } = resolveWorkspaceSetupPresets([]);
		expect(setupCommands).toEqual([]);
		expect(scaffoldFiles).toEqual([]);
	});

	it("keeps visible rox config shareable while ignoring local overlays", () => {
		const gitignore =
			getWorkspaceSetupPresetById("gitignore")?.scaffoldFiles?.[0];
		const lines = gitignore?.contents.split("\n") ?? [];
		expect(lines).toContain(".rox/");
		expect(lines).toContain("rox/config.local.json");
		expect(lines).not.toContain("rox/");
	});
});
