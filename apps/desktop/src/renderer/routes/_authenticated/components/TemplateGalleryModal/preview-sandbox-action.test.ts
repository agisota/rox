import { describe, expect, it } from "bun:test";
import { LuLayers } from "react-icons/lu";
import { getTemplateSelectAction } from "./preview-sandbox-action";
import { PROJECT_TEMPLATES, type ProjectTemplate } from "./templates";

const repoTemplate: ProjectTemplate = {
	id: "nextjs",
	name: "Next.js",
	description: "Vercel starter",
	icon: LuLayers,
	bannerClassName: "bg-black",
	repo: "https://github.com/vercel/nextjs-postgres-auth-starter",
};

const presetTemplate: ProjectTemplate = {
	id: "strategy-brief",
	name: "Strategy brief",
	description: "Empty git project",
	icon: LuLayers,
	bannerClassName: "bg-emerald-700",
	starterPresetIds: ["docs-first-bootstrap"],
	defaultProjectName: "strategy-brief",
};

const emptyTemplate: ProjectTemplate = {
	id: "coming-soon",
	name: "Coming soon",
	description: "Not usable",
	icon: LuLayers,
	bannerClassName: "bg-zinc-900",
};

describe("getTemplateSelectAction", () => {
	it("previews a previewable template when the sandbox is enabled", () => {
		expect(getTemplateSelectAction(repoTemplate, true)).toBe("preview");
		expect(getTemplateSelectAction(presetTemplate, true)).toBe("preview");
	});

	it("applies immediately when the sandbox is disabled (original behaviour)", () => {
		expect(getTemplateSelectAction(repoTemplate, false)).toBe("apply");
		expect(getTemplateSelectAction(presetTemplate, false)).toBe("apply");
	});

	it("always applies a non-previewable template regardless of the gate", () => {
		expect(getTemplateSelectAction(emptyTemplate, true)).toBe("apply");
		expect(getTemplateSelectAction(emptyTemplate, false)).toBe("apply");
	});

	it("previews every real catalog template when the sandbox is enabled", () => {
		// Every shipped template is repo- or preset-backed, so the preview step
		// must engage for all of them once the experiment is on.
		for (const template of PROJECT_TEMPLATES) {
			expect(getTemplateSelectAction(template, true)).toBe("preview");
		}
	});
});
