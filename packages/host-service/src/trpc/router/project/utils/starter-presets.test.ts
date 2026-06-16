import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyWorkspaceStarterPresets } from "./starter-presets";

let repoPath: string | null = null;

function createRepo(): string {
	repoPath = mkdtempSync(join(tmpdir(), "starter-presets-test-"));
	return repoPath;
}

afterEach(() => {
	if (!repoPath) return;
	rmSync(repoPath, { recursive: true, force: true });
	repoPath = null;
});

describe("applyWorkspaceStarterPresets", () => {
	test("materializes selected starter scaffold files and setup commands", () => {
		const repo = createRepo();

		applyWorkspaceStarterPresets({
			repoPath: repo,
			starterPresetIds: ["planning-docs", "agent-context-scaffold"],
		});

		expect(readFileSync(join(repo, "todo.md"), "utf-8")).toContain("# TODO");
		expect(readFileSync(join(repo, "spec.md"), "utf-8")).toContain("# Spec");
		expect(readFileSync(join(repo, "planner.md"), "utf-8")).toContain(
			"# Planner",
		);

		const roxConfig = JSON.parse(
			readFileSync(join(repo, "rox", "config.json"), "utf-8"),
		) as { setup?: string[] };
		expect(roxConfig.setup).toEqual([
			"mkdir -p rox",
			"mkdir -p .agent",
			"mkdir -p .memory",
		]);
	});

	test("preserves existing files and appends setup commands once", () => {
		const repo = createRepo();
		writeFileSync(join(repo, "todo.md"), "keep me", "utf-8");

		applyWorkspaceStarterPresets({
			repoPath: repo,
			starterPresetIds: [
				"planning-docs",
				"agent-context-scaffold",
				"agent-context-scaffold",
			],
		});

		expect(readFileSync(join(repo, "todo.md"), "utf-8")).toBe("keep me");
		expect(readFileSync(join(repo, "spec.md"), "utf-8")).toContain("# Spec");

		const roxConfig = JSON.parse(
			readFileSync(join(repo, "rox", "config.json"), "utf-8"),
		) as { setup?: string[] };
		expect(roxConfig.setup).toEqual([
			"mkdir -p rox",
			"mkdir -p .agent",
			"mkdir -p .memory",
		]);
	});

	test("rejects unknown starter ids", () => {
		const repo = createRepo();

		expect(() =>
			applyWorkspaceStarterPresets({
				repoPath: repo,
				starterPresetIds: ["does-not-exist"],
			}),
		).toThrow(/Unknown workspace starter preset/);
	});
});
