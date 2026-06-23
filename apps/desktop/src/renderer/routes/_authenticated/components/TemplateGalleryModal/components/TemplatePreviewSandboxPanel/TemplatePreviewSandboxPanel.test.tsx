import { describe, expect, it } from "bun:test";
import { deriveTemplatePreview } from "@rox/shared/template-preview-sandbox";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplatePreviewSandboxPanel } from "./TemplatePreviewSandboxPanel";

describe("TemplatePreviewSandboxPanel", () => {
	it("renders the dry-run plan for a preset-only template", () => {
		const plan = deriveTemplatePreview({
			id: "strategy-brief",
			name: "Strategy brief",
			description: "Empty git project",
			starterPresetIds: ["docs-first-bootstrap", "agent-planning-kit"],
			defaultProjectName: "strategy-brief",
		});

		const markup = renderToStaticMarkup(
			<TemplatePreviewSandboxPanel
				plan={plan}
				onBack={() => {}}
				onApply={() => {}}
			/>,
		);

		// Header + derived project name + the empty-git create mode.
		expect(markup).toContain("Strategy brief");
		expect(markup).toContain("strategy-brief");
		expect(markup).toContain("Пустой git-workspace");
		// Every scaffolded file path the engine would create is listed.
		for (const file of plan.scaffoldFiles) {
			expect(markup).toContain(file.path);
		}
		// The explicit apply action is present (nothing is created until clicked).
		expect(markup).toContain("Создать проект");
		expect(markup).toContain("Назад");
	});

	it("renders a clone-repo plan with the repo URL and no scaffold files", () => {
		const plan = deriveTemplatePreview({
			id: "nextjs",
			name: "Next.js",
			repo: "https://github.com/vercel/nextjs-postgres-auth-starter",
		});

		const markup = renderToStaticMarkup(
			<TemplatePreviewSandboxPanel
				plan={plan}
				onBack={() => {}}
				onApply={() => {}}
			/>,
		);

		expect(markup).toContain("Клонирование репозитория");
		expect(markup).toContain(
			"https://github.com/vercel/nextjs-postgres-auth-starter",
		);
		expect(markup).toContain("nextjs-postgres-auth-starter");
	});

	it("shows the applying state on the create button", () => {
		const plan = deriveTemplatePreview({
			id: "remix",
			name: "Remix",
			repo: "https://github.com/remix-run/indie-stack",
		});

		const markup = renderToStaticMarkup(
			<TemplatePreviewSandboxPanel
				plan={plan}
				applying
				onBack={() => {}}
				onApply={() => {}}
			/>,
		);

		expect(markup).toContain("Создание…");
	});

	it("warns about unknown starter presets instead of hiding them", () => {
		const plan = deriveTemplatePreview({
			id: "broken",
			name: "Broken",
			starterPresetIds: ["readme", "does-not-exist"],
		});

		const markup = renderToStaticMarkup(
			<TemplatePreviewSandboxPanel
				plan={plan}
				onBack={() => {}}
				onApply={() => {}}
			/>,
		);

		expect(markup).toContain("does-not-exist");
	});
});
