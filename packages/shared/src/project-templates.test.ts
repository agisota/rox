import { describe, expect, test } from "bun:test";
import {
	isTemplateEntryUsable,
	PROJECT_TEMPLATE_ENTRIES,
	type ProjectTemplateEntry,
	templateCreateMode,
} from "./project-templates";

describe("PROJECT_TEMPLATE_ENTRIES catalog", () => {
	test("is non-empty and every entry has a unique id", () => {
		expect(PROJECT_TEMPLATE_ENTRIES.length).toBeGreaterThan(0);
		const ids = PROJECT_TEMPLATE_ENTRIES.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("every entry is usable (clones a repo or applies a starter preset)", () => {
		// An offered marketplace card must never be a dead end.
		for (const entry of PROJECT_TEMPLATE_ENTRIES) {
			expect(isTemplateEntryUsable(entry)).toBe(true);
		}
	});

	test("every entry carries the render hints a card needs", () => {
		for (const entry of PROJECT_TEMPLATE_ENTRIES) {
			expect(entry.name.length).toBeGreaterThan(0);
			expect(entry.description?.length ?? 0).toBeGreaterThan(0);
			expect(entry.iconKey.length).toBeGreaterThan(0);
			expect(entry.accentClassName.length).toBeGreaterThan(0);
		}
	});

	test("repo entries map to clone-repo, preset-only entries to empty-git-workspace", () => {
		for (const entry of PROJECT_TEMPLATE_ENTRIES) {
			const mode = templateCreateMode(entry);
			expect(mode).toBe(entry.repo ? "clone-repo" : "empty-git-workspace");
		}
	});

	test("preset-only entries declare a defaultProjectName (engine project name)", () => {
		for (const entry of PROJECT_TEMPLATE_ENTRIES) {
			if (!entry.repo) {
				expect((entry.defaultProjectName ?? "").length).toBeGreaterThan(0);
				expect((entry.starterPresetIds ?? []).length).toBeGreaterThan(0);
			}
		}
	});
});

describe("isTemplateEntryUsable", () => {
	const base: ProjectTemplateEntry = {
		id: "x",
		name: "X",
		iconKey: "layers",
		accentClassName: "bg-zinc-900 text-white",
	};

	test("true when the template has a repo", () => {
		expect(isTemplateEntryUsable({ ...base, repo: "https://example/x" })).toBe(
			true,
		);
	});

	test("true when the template has at least one starter preset", () => {
		expect(
			isTemplateEntryUsable({ ...base, starterPresetIds: ["docs-first"] }),
		).toBe(true);
	});

	test("false when the template has neither a repo nor a starter preset", () => {
		expect(isTemplateEntryUsable(base)).toBe(false);
		expect(isTemplateEntryUsable({ ...base, starterPresetIds: [] })).toBe(
			false,
		);
	});
});
