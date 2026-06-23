import { describe, expect, it } from "bun:test";
import {
	deriveTemplatePermissionsManifest,
	isTemplateInstallable,
} from "./template-permissions-manifest";

describe("deriveTemplatePermissionsManifest", () => {
	it("derives a clone-repository scope + project name for a repo template", () => {
		const manifest = deriveTemplatePermissionsManifest({
			id: "nextjs",
			name: "Next.js",
			description: "Vercel starter",
			repo: "https://github.com/vercel/nextjs-postgres-auth-starter",
		});

		expect(manifest.createMode).toBe("clone-repo");
		expect(manifest.projectName).toBe("nextjs-postgres-auth-starter");
		expect(manifest.repoUrl).toBe(
			"https://github.com/vercel/nextjs-postgres-auth-starter",
		);
		// A repo-only template has exactly one scope: clone the repository.
		expect(manifest.scopes.map((scope) => scope.id)).toEqual([
			"clone-repository",
		]);
		const cloneScope = manifest.scopes[0];
		expect(cloneScope?.severity).toBe("elevated");
		expect(cloneScope?.detail).toBe(
			"https://github.com/vercel/nextjs-postgres-auth-starter",
		);
		// Repo-only template scaffolds nothing locally.
		expect(manifest.starterPresets).toHaveLength(0);
		expect(manifest.scaffoldFiles).toHaveLength(0);
		expect(manifest.setupCommands).toHaveLength(0);
	});

	it("derives preset/file/command scopes for a preset-only template", () => {
		const manifest = deriveTemplatePermissionsManifest({
			id: "strategy-brief",
			name: "Strategy brief",
			description: "Empty git project",
			starterPresetIds: ["docs-first-bootstrap", "agent-planning-kit"],
			defaultProjectName: "strategy-brief",
		});

		expect(manifest.createMode).toBe("empty-git-workspace");
		expect(manifest.projectName).toBe("strategy-brief");
		expect(manifest.repoUrl).toBeUndefined();

		// The resolved presets carry catalog metadata (label + description) so the
		// confirm step lists names, not bare ids.
		expect(manifest.starterPresets.length).toBeGreaterThan(0);
		for (const preset of manifest.starterPresets) {
			expect(preset.label.length).toBeGreaterThan(0);
			expect(preset.description.length).toBeGreaterThan(0);
		}

		const scopeIds = manifest.scopes.map((scope) => scope.id);
		// Empty workspace => init scope first, then presets, files, and commands.
		expect(scopeIds[0]).toBe("init-empty-workspace");
		expect(scopeIds).toContain("apply-starter-presets");
		expect(scopeIds).toContain("write-workspace-files");
		// A preset-only template never clones a remote.
		expect(scopeIds).not.toContain("clone-repository");

		// The preset count is reflected on the apply-presets scope detail.
		const presetScope = manifest.scopes.find(
			(scope) => scope.id === "apply-starter-presets",
		);
		expect(presetScope?.detail).toContain(
			String(manifest.starterPresets.length),
		);
	});

	it("marks setup-command execution as an elevated scope", () => {
		// repo-init-github-sync bundles git-init + github-repo-create + github-sync,
		// which contribute setup commands the engine runs on the machine.
		const manifest = deriveTemplatePermissionsManifest({
			id: "github-bootstrap",
			name: "GitHub bootstrap",
			starterPresetIds: ["repo-init-github-sync"],
		});

		const commandScope = manifest.scopes.find(
			(scope) => scope.id === "run-setup-commands",
		);
		expect(manifest.setupCommands.length).toBeGreaterThan(0);
		expect(commandScope).toBeDefined();
		expect(commandScope?.severity).toBe("elevated");
	});

	it("surfaces unknown starter presets instead of silently dropping them", () => {
		const manifest = deriveTemplatePermissionsManifest({
			id: "broken",
			name: "Broken",
			// `minimal-readme-gitignore` is a real STARTER id; `does-not-exist` is not.
			starterPresetIds: ["minimal-readme-gitignore", "does-not-exist"],
		});

		expect(manifest.unknownStarterPresetIds).toContain("does-not-exist");
		// The known starter still resolves to its catalog metadata.
		expect(manifest.starterPresets.map((preset) => preset.id)).toContain(
			"minimal-readme-gitignore",
		);
	});

	it("is pure: repeated derivation yields a deep-equal manifest", () => {
		const input = {
			id: "ops-analytics",
			name: "Ops analytics",
			starterPresetIds: ["docs-first-bootstrap", "task-tracker-lite"],
			defaultProjectName: "ops-analytics",
		} as const;
		expect(deriveTemplatePermissionsManifest(input)).toEqual(
			deriveTemplatePermissionsManifest(input),
		);
	});

	it("isTemplateInstallable mirrors previewability (repo or presets)", () => {
		expect(
			isTemplateInstallable({ id: "a", name: "A", repo: "https://x/y" }),
		).toBe(true);
		expect(
			isTemplateInstallable({
				id: "b",
				name: "B",
				starterPresetIds: ["readme"],
			}),
		).toBe(true);
		expect(isTemplateInstallable({ id: "c", name: "C" })).toBe(false);
	});
});
