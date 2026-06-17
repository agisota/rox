import { describe, expect, it } from "bun:test";
import {
	getWorkspaceSetupPresetById,
	WORKSPACE_SETUP_PRESETS,
} from "./workspace-setup-presets";
import {
	applyStarterToSelection,
	getWorkspaceStarterPresetById,
	isStarterSelected,
	removeStarterFromSelection,
	resolveWorkspaceStarterPreset,
	starterAsSetupPreset,
	WORKSPACE_STARTER_PRESETS,
} from "./workspace-starter-presets";

describe("workspace-starter-presets", () => {
	it("exposes 15-40 starters with unique ids", () => {
		expect(WORKSPACE_STARTER_PRESETS.length).toBeGreaterThanOrEqual(15);
		expect(WORKSPACE_STARTER_PRESETS.length).toBeLessThanOrEqual(40);
		const ids = WORKSPACE_STARTER_PRESETS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("documents every starter with a label, description, and preset ids", () => {
		for (const starter of WORKSPACE_STARTER_PRESETS) {
			expect(starter.label.length).toBeGreaterThan(0);
			expect(starter.description.length).toBeGreaterThan(0);
			expect(starter.presetIds.length).toBeGreaterThan(0);
		}
	});

	it("only references preset ids that exist in the single-effect catalog", () => {
		for (const starter of WORKSPACE_STARTER_PRESETS) {
			for (const id of starter.presetIds) {
				expect(getWorkspaceSetupPresetById(id)).toBeDefined();
			}
		}
	});

	it("keeps the everything starter within the developer setup catalog", () => {
		const setupIds = new Set(
			WORKSPACE_SETUP_PRESETS.map((preset) => preset.id),
		);
		const everything = getWorkspaceStarterPresetById("everything");
		expect(everything).toBeDefined();
		expect(everything?.description).toContain("developer bootstrap");
		for (const id of everything?.presetIds ?? []) {
			expect(setupIds.has(id)).toBe(true);
		}
		expect(everything?.presetIds).not.toContain("product-brief");
		expect(everything?.presetIds).not.toContain("seo-content-plan");
		expect(everything?.presetIds).not.toContain("finance-operating-model");
	});

	it("has no duplicate preset ids within a single starter", () => {
		for (const starter of WORKSPACE_STARTER_PRESETS) {
			expect(new Set(starter.presetIds).size).toBe(starter.presetIds.length);
		}
	});

	it("looks up starters by id", () => {
		expect(getWorkspaceStarterPresetById("repo-init-github-sync")?.label).toBe(
			"Repo init + GitHub sync",
		);
		expect(getWorkspaceStarterPresetById("does-not-exist")).toBeUndefined();
	});

	it("resolves a starter into its commands and files", () => {
		const resolved = resolveWorkspaceStarterPreset("repo-init-github-sync");
		expect(resolved?.setupCommands).toEqual([
			"git init",
			'gh repo create "$(basename "$PWD")" --private --source=. --remote=origin --push',
			"git fetch origin",
			"git pull --ff-only || true",
		]);
		expect(resolved?.scaffoldFiles).toEqual([]);
	});

	it("returns undefined for an unknown starter id", () => {
		expect(resolveWorkspaceStarterPreset("nope")).toBeUndefined();
		expect(starterAsSetupPreset("nope")).toBeUndefined();
	});

	it("presents a starter as a composite setup preset", () => {
		const preset = starterAsSetupPreset("planning-docs");
		expect(preset?.id).toBe("planning-docs");
		expect(preset?.setupCommands).toBeUndefined();
		expect(preset?.scaffoldFiles?.map((f) => f.path)).toEqual([
			"todo.md",
			"spec.md",
			"planner.md",
		]);
	});

	// Snapshot of each starter's generated file set + command count, so any change
	// to a referenced preset's outputs is caught here.
	it("matches the snapshot of each starter's generated file set", () => {
		const summary = WORKSPACE_STARTER_PRESETS.map((starter) => {
			const resolved = resolveWorkspaceStarterPreset(starter.id);
			return {
				id: starter.id,
				commandCount: resolved?.setupCommands.length ?? 0,
				files: resolved?.scaffoldFiles.map((f) => f.path) ?? [],
			};
		});
		expect(summary).toEqual([
			{
				id: "repo-init-github-sync",
				commandCount: 4,
				files: [],
			},
			{
				id: "agents-md-generator",
				commandCount: 0,
				files: ["AGENTS.md", "README.md"],
			},
			{
				id: "agent-context-scaffold",
				commandCount: 3,
				files: [],
			},
			{
				id: "planning-docs",
				commandCount: 0,
				files: ["todo.md", "spec.md", "planner.md"],
			},
			{
				id: "cicd-autodeploy",
				commandCount: 0,
				files: [".github/workflows/deploy.yml", ".gitignore"],
			},
			{
				id: "deep-wiki-cold-graph",
				commandCount: 3,
				files: [],
			},
			{
				id: "code-intelligence-lite",
				commandCount: 2,
				files: [],
			},
			{
				id: "cold-graph-only",
				commandCount: 1,
				files: [],
			},
			{
				id: "open-source-baseline",
				commandCount: 0,
				files: [".gitignore", "README.md", ".editorconfig", "LICENSE"],
			},
			{
				id: "minimal-readme-gitignore",
				commandCount: 0,
				files: [".gitignore", "README.md"],
			},
			{
				id: "formatting-baseline",
				commandCount: 0,
				files: [".gitignore", ".editorconfig"],
			},
			{
				id: "agent-planning-kit",
				commandCount: 0,
				files: ["AGENTS.md", "todo.md", "spec.md", "planner.md"],
			},
			{
				id: "memory-backed-agent-kit",
				commandCount: 1,
				files: ["AGENTS.md"],
			},
			{
				id: "rox-config-baseline",
				commandCount: 1,
				files: [".gitignore"],
			},
			{
				id: "ci-release-baseline",
				commandCount: 0,
				files: [
					".github/workflows/deploy.yml",
					".gitignore",
					"README.md",
					"LICENSE",
				],
			},
			{
				id: "docs-first-bootstrap",
				commandCount: 0,
				files: ["spec.md", "planner.md", "README.md"],
			},
			{
				id: "github-private-starter",
				commandCount: 2,
				files: [".gitignore", "README.md"],
			},
			{
				id: "task-tracker-lite",
				commandCount: 0,
				files: ["todo.md", "planner.md"],
			},
			{
				id: "spec-review-kit",
				commandCount: 0,
				files: ["AGENTS.md", "spec.md", "README.md"],
			},
			{
				id: "product-manager-kit",
				commandCount: 0,
				files: ["todo.md", "planner.md", "product/brief.md", "README.md"],
			},
			{
				id: "seo-content-kit",
				commandCount: 0,
				files: ["planner.md", "marketing/seo-content-plan.md", "README.md"],
			},
			{
				id: "finance-ops-kit",
				commandCount: 0,
				files: ["planner.md", "finance/operating-model.md", "README.md"],
			},
			{
				id: "everything",
				commandCount: 10,
				files: [
					"AGENTS.md",
					".github/workflows/deploy.yml",
					"todo.md",
					"spec.md",
					"planner.md",
					".gitignore",
					"README.md",
					".editorconfig",
					"LICENSE",
				],
			},
			{
				id: "minimal-git",
				commandCount: 1,
				files: [],
			},
			{
				id: "agent-ready",
				commandCount: 3,
				files: ["AGENTS.md"],
			},
			{
				id: "prototyping",
				commandCount: 0,
				files: ["todo.md", "spec.md", "README.md"],
			},
			{
				id: "community-health",
				commandCount: 0,
				files: ["README.md", "LICENSE", "CONTRIBUTING.md"],
			},
			{
				id: "dockerized",
				commandCount: 0,
				files: ["Dockerfile", ".dockerignore"],
			},
			{
				id: "devcontainer-ready",
				commandCount: 0,
				files: [".editorconfig", ".devcontainer/devcontainer.json", ".nvmrc"],
			},
			{
				id: "env-config",
				commandCount: 0,
				files: [".gitignore", ".env.example"],
			},
		]);
	});
});

describe("starter selection helpers", () => {
	it("applies a starter's preset ids to an empty selection, in catalog order", () => {
		expect(applyStarterToSelection([], "planning-docs")).toEqual([
			"todo-md",
			"spec-md",
			"planner-md",
		]);
	});

	it("unions a starter into an existing selection, deduped and in catalog order", () => {
		// agents-md-generator bundles ["agents-md", "readme"]; "readme" already selected.
		expect(applyStarterToSelection(["readme"], "agents-md-generator")).toEqual([
			"agents-md",
			"readme",
		]);
	});

	it("drops ids absent from the single-effect catalog when applying a starter", () => {
		expect(
			applyStarterToSelection(["bogus-id", "git-init"], "planning-docs"),
		).toEqual(["git-init", "todo-md", "spec-md", "planner-md"]);
	});

	it("returns the normalized selection unchanged for an unknown starter id", () => {
		expect(applyStarterToSelection(["git-init", "bogus-id"], "nope")).toEqual([
			"git-init",
		]);
	});

	it("reports a starter selected only when every bundled preset id is present", () => {
		expect(
			isStarterSelected(["todo-md", "spec-md", "planner-md"], "planning-docs"),
		).toBe(true);
		expect(isStarterSelected(["todo-md", "spec-md"], "planning-docs")).toBe(
			false,
		);
		expect(isStarterSelected([], "nope")).toBe(false);
	});

	it("removes a starter's preset ids from the selection, keeping the rest", () => {
		expect(
			removeStarterFromSelection(
				["git-init", "todo-md", "spec-md", "planner-md"],
				"planning-docs",
			),
		).toEqual(["git-init"]);
	});

	it("removing an unselected starter leaves the normalized selection unchanged", () => {
		expect(removeStarterFromSelection(["git-init"], "planning-docs")).toEqual([
			"git-init",
		]);
	});
});
