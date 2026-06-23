import { describe, expect, it } from "bun:test";
import { LuLayers } from "react-icons/lu";
import { getTemplateInstallAction } from "./permissions-manifest-action";
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

describe("getTemplateInstallAction", () => {
	it("routes through the manifest confirm step when the gate is ON", () => {
		expect(getTemplateInstallAction(repoTemplate, true)).toBe("manifest");
		expect(getTemplateInstallAction(presetTemplate, true)).toBe("manifest");
	});

	it("creates immediately when the gate is OFF (no regression)", () => {
		expect(getTemplateInstallAction(repoTemplate, false)).toBe("create");
		expect(getTemplateInstallAction(presetTemplate, false)).toBe("create");
	});

	it("always creates a non-installable template regardless of the gate", () => {
		expect(getTemplateInstallAction(emptyTemplate, true)).toBe("create");
		expect(getTemplateInstallAction(emptyTemplate, false)).toBe("create");
	});

	it("shows the manifest for every real catalog template when the gate is ON", () => {
		// Every shipped template is repo- or preset-backed, so the confirm step
		// must engage for all of them once the experiment is on.
		for (const template of PROJECT_TEMPLATES) {
			expect(getTemplateInstallAction(template, true)).toBe("manifest");
		}
	});
});
