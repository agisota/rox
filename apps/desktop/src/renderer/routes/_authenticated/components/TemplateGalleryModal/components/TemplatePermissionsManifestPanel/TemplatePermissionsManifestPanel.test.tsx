import { describe, expect, it } from "bun:test";
import { deriveTemplatePermissionsManifest } from "@rox/shared/template-permissions-manifest";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplatePermissionsManifestPanel } from "./TemplatePermissionsManifestPanel";

describe("TemplatePermissionsManifestPanel", () => {
	it("lists the granted scopes, presets, and project name for a preset template", () => {
		const manifest = deriveTemplatePermissionsManifest({
			id: "strategy-brief",
			name: "Strategy brief",
			description: "Empty git project",
			starterPresetIds: ["docs-first-bootstrap", "agent-planning-kit"],
			defaultProjectName: "strategy-brief",
		});

		const markup = renderToStaticMarkup(
			<TemplatePermissionsManifestPanel
				manifest={manifest}
				onCancel={() => {}}
				onConfirm={() => {}}
			/>,
		);

		// Header + derived project name + empty-git create mode.
		expect(markup).toContain("Strategy brief");
		expect(markup).toContain("strategy-brief");
		expect(markup).toContain("Пустой git-workspace");
		// The "what will be applied" scopes section is present.
		expect(markup).toContain("Будет применено");
		expect(markup).toContain("Создать пустой git-workspace");
		expect(markup).toContain("Применить стартовые пресеты");
		// Resolved preset labels are listed (names, not bare ids).
		for (const preset of manifest.starterPresets) {
			expect(markup).toContain(preset.label);
		}
		// Every scaffolded file path the engine would create is listed.
		for (const file of manifest.scaffoldFiles) {
			expect(markup).toContain(file.path);
		}
		// The explicit confirm + cancel controls are present.
		expect(markup).toContain("Подтвердить и создать");
		expect(markup).toContain("Отмена");
	});

	it("shows a clone-repository scope with the repo URL for a repo template", () => {
		const manifest = deriveTemplatePermissionsManifest({
			id: "nextjs",
			name: "Next.js",
			repo: "https://github.com/vercel/nextjs-postgres-auth-starter",
		});

		const markup = renderToStaticMarkup(
			<TemplatePermissionsManifestPanel
				manifest={manifest}
				onCancel={() => {}}
				onConfirm={() => {}}
			/>,
		);

		expect(markup).toContain("Клонировать репозиторий");
		expect(markup).toContain(
			"https://github.com/vercel/nextjs-postgres-auth-starter",
		);
		expect(markup).toContain("nextjs-postgres-auth-starter");
	});

	it("shows the confirming state on the create button", () => {
		const manifest = deriveTemplatePermissionsManifest({
			id: "remix",
			name: "Remix",
			repo: "https://github.com/remix-run/indie-stack",
		});

		const markup = renderToStaticMarkup(
			<TemplatePermissionsManifestPanel
				manifest={manifest}
				confirming
				onCancel={() => {}}
				onConfirm={() => {}}
			/>,
		);

		expect(markup).toContain("Создание…");
	});

	it("warns about unknown starter presets instead of hiding them", () => {
		const manifest = deriveTemplatePermissionsManifest({
			id: "broken",
			name: "Broken",
			starterPresetIds: ["minimal-readme-gitignore", "does-not-exist"],
		});

		const markup = renderToStaticMarkup(
			<TemplatePermissionsManifestPanel
				manifest={manifest}
				onCancel={() => {}}
				onConfirm={() => {}}
			/>,
		);

		expect(markup).toContain("does-not-exist");
	});
});
