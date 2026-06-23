import { describe, expect, it } from "bun:test";
import {
	deriveProjectNameFromRepoUrl,
	deriveTemplatePreview,
	isTemplatePreviewable,
	type TemplatePreviewInput,
} from "./template-preview-sandbox";
import {
	getWorkspaceStarterPresetById,
	resolveWorkspaceStarterPreset,
} from "./workspace-starter-presets";

describe("template-preview-sandbox derivation", () => {
	it("derives a clone-repo plan with the repo basename as the project name", () => {
		const template: TemplatePreviewInput = {
			id: "nextjs",
			name: "Next.js",
			description: "Vercel starter",
			repo: "https://github.com/vercel/nextjs-postgres-auth-starter",
		};

		const plan = deriveTemplatePreview(template);

		expect(plan.createMode).toBe("clone-repo");
		expect(plan.repoUrl).toBe(
			"https://github.com/vercel/nextjs-postgres-auth-starter",
		);
		expect(plan.projectName).toBe("nextjs-postgres-auth-starter");
		// A repo template clones; it does not apply starter presets / scaffold files.
		expect(plan.starterPresets).toEqual([]);
		expect(plan.scaffoldFiles).toEqual([]);
		expect(plan.setupCommands).toEqual([]);
		expect(plan.unknownStarterPresetIds).toEqual([]);
	});

	it("strips a trailing .git suffix when deriving the repo project name", () => {
		const plan = deriveTemplatePreview({
			id: "x",
			name: "X",
			repo: "https://github.com/acme/widgets.git",
		});
		expect(plan.projectName).toBe("widgets");
	});

	it("derives an empty-git-workspace plan for a preset-only template", () => {
		const template: TemplatePreviewInput = {
			id: "strategy-brief",
			name: "Strategy brief",
			description: "Empty git project with docs",
			starterPresetIds: ["docs-first-bootstrap", "agent-planning-kit"],
			defaultProjectName: "strategy-brief",
		};

		const plan = deriveTemplatePreview(template);

		expect(plan.createMode).toBe("empty-git-workspace");
		expect(plan.repoUrl).toBeUndefined();
		expect(plan.projectName).toBe("strategy-brief");
		expect(plan.starterPresets.map((preset) => preset.id)).toEqual([
			"docs-first-bootstrap",
			"agent-planning-kit",
		]);
	});

	it("falls back to the template id when a preset template has no default name", () => {
		const plan = deriveTemplatePreview({
			id: "ops-analytics",
			name: "Ops analytics",
			starterPresetIds: ["task-tracker-lite"],
		});
		expect(plan.projectName).toBe("ops-analytics");
	});

	it("matches the starter-preset catalog for files and commands (no drift)", () => {
		// The preview must reproduce exactly what the engine's
		// resolveWorkspaceStarterPreset pipeline would scaffold for the same ids,
		// de-duplicated across the bundle.
		const starterPresetIds = ["docs-first-bootstrap", "agent-planning-kit"];
		const plan = deriveTemplatePreview({
			id: "strategy-brief",
			name: "Strategy brief",
			starterPresetIds,
			defaultProjectName: "strategy-brief",
		});

		const expectedPaths = new Set<string>();
		const expectedCommands = new Set<string>();
		for (const id of starterPresetIds) {
			const resolved = resolveWorkspaceStarterPreset(id);
			expect(resolved).toBeDefined();
			for (const file of resolved?.scaffoldFiles ?? [])
				expectedPaths.add(file.path);
			for (const command of resolved?.setupCommands ?? [])
				expectedCommands.add(command);
		}

		expect(new Set(plan.scaffoldFiles.map((file) => file.path))).toEqual(
			expectedPaths,
		);
		expect(new Set(plan.setupCommands)).toEqual(expectedCommands);
		// docs-first-bootstrap and agent-planning-kit both scaffold planner.md /
		// spec.md — the preview must de-duplicate by path.
		const paths = plan.scaffoldFiles.map((file) => file.path);
		expect(new Set(paths).size).toBe(paths.length);
	});

	it("surfaces preset labels/descriptions straight from the catalog", () => {
		const plan = deriveTemplatePreview({
			id: "seo",
			name: "SEO hub",
			starterPresetIds: ["minimal-readme-gitignore"],
		});
		const catalog = getWorkspaceStarterPresetById("minimal-readme-gitignore");
		expect(catalog).toBeDefined();
		expect(plan.starterPresets[0]).toEqual({
			id: catalog?.id ?? "",
			label: catalog?.label ?? "",
			description: catalog?.description ?? "",
		});
	});

	it("records unknown starter preset ids instead of silently dropping them", () => {
		const plan = deriveTemplatePreview({
			id: "broken",
			name: "Broken",
			starterPresetIds: ["minimal-readme-gitignore", "does-not-exist"],
		});
		expect(plan.unknownStarterPresetIds).toEqual(["does-not-exist"]);
		// The known preset still resolves.
		expect(plan.starterPresets.map((preset) => preset.id)).toEqual([
			"minimal-readme-gitignore",
		]);
	});

	it("is a pure dry-run: identical input yields a deep-equal plan", () => {
		const template: TemplatePreviewInput = {
			id: "t3-turbo",
			name: "T3 Turbo",
			repo: "https://github.com/t3-oss/create-t3-turbo",
		};
		expect(deriveTemplatePreview(template)).toEqual(
			deriveTemplatePreview(template),
		);
	});
});

describe("deriveProjectNameFromRepoUrl", () => {
	it("handles query strings, fragments, and trailing slashes", () => {
		expect(
			deriveProjectNameFromRepoUrl("https://github.com/a/b/?x=1#frag"),
		).toBe("b");
		expect(deriveProjectNameFromRepoUrl("git@github.com:a/c.git")).toBe("c");
		expect(deriveProjectNameFromRepoUrl("https://github.com/a/d/")).toBe("d");
	});
});

describe("isTemplatePreviewable", () => {
	it("is true for repo templates and preset templates, false otherwise", () => {
		expect(isTemplatePreviewable({ id: "a", name: "A", repo: "x" })).toBe(true);
		expect(
			isTemplatePreviewable({
				id: "b",
				name: "B",
				starterPresetIds: ["readme" as never],
			}),
		).toBe(true);
		expect(isTemplatePreviewable({ id: "c", name: "C" })).toBe(false);
		expect(
			isTemplatePreviewable({ id: "d", name: "D", starterPresetIds: [] }),
		).toBe(false);
	});
});
