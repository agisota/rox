import { describe, expect, it } from "bun:test";
import {
	buildSkillsManifest,
	DEFAULT_SKILLS,
	mergeSkillsReadme,
} from "./setup-skills";

const DEFAULT_NAMES: readonly string[] = DEFAULT_SKILLS.map(
	(skill) => skill.name,
);

describe("DEFAULT_SKILLS", () => {
	it("ships the curated Rox preinstalled skill set", () => {
		expect([...DEFAULT_NAMES].sort()).toEqual(
			["dev-skills", "effective-html", "markdown-editor"].sort(),
		);
		for (const skill of DEFAULT_SKILLS) {
			expect(skill.repo).toStartWith("github.com/plannotator/");
			expect(skill.description.length).toBeGreaterThan(0);
		}
	});
});

describe("buildSkillsManifest", () => {
	it("creates a fresh manifest marked for the Навыки tab", () => {
		const out = buildSkillsManifest(null);
		expect(out).not.toBeNull();
		const parsed = JSON.parse(out as string) as {
			preinstalled: boolean;
			skills: Array<{
				name: string;
				preinstalled: boolean;
				bundled: boolean;
				installState: string;
			}>;
		};
		expect(parsed.preinstalled).toBe(true);
		expect(parsed.skills.map((skill) => skill.name).sort()).toEqual(
			[...DEFAULT_NAMES].sort(),
		);
		for (const skill of parsed.skills) {
			expect(skill.preinstalled).toBe(true);
			expect(skill.bundled).toBe(false);
			expect(skill.installState).toBe("reference-only");
		}
		expect((out as string).endsWith("}\n")).toBe(true);
	});

	it("preserves existing manifest entries and top-level keys", () => {
		const existing = JSON.stringify({
			$schema: "https://example.com/skills.schema.json",
			skills: [{ name: "local-skill", repo: "file://local" }],
		});
		const out = buildSkillsManifest(existing);
		const parsed = JSON.parse(out as string) as {
			$schema: string;
			skills: Array<{ name: string; repo?: string }>;
		};
		expect(parsed.$schema).toBe("https://example.com/skills.schema.json");
		expect(parsed.skills.find((skill) => skill.name === "local-skill")).toEqual(
			{
				name: "local-skill",
				repo: "file://local",
			},
		);
		for (const name of DEFAULT_NAMES) {
			expect(parsed.skills.some((skill) => skill.name === name)).toBe(true);
		}
	});

	it("never overwrites an existing skill entry with the same name", () => {
		const existing = JSON.stringify({
			skills: [
				{
					name: "dev-skills",
					repo: "file://custom-dev-skills",
					description: "Custom local override",
				},
			],
		});
		const out = buildSkillsManifest(existing);
		const parsed = JSON.parse(out as string) as {
			skills: Array<{ name: string; repo: string; description?: string }>;
		};
		expect(parsed.skills.find((skill) => skill.name === "dev-skills")).toEqual({
			name: "dev-skills",
			repo: "file://custom-dev-skills",
			description: "Custom local override",
		});
		expect(parsed.skills.some((skill) => skill.name === "effective-html")).toBe(
			true,
		);
	});

	it("is a no-op when all defaults already exist", () => {
		const first = buildSkillsManifest(null) as string;
		expect(buildSkillsManifest(first)).toBeNull();
	});
});

describe("mergeSkillsReadme", () => {
	it("creates a README block for reference-only preinstalled skills", () => {
		const out = mergeSkillsReadme(null);
		expect(out).not.toBeNull();
		const text = out as string;
		expect(text).toContain("Rox preinstalled skills");
		expect(text).toContain("Навыки");
		for (const skill of DEFAULT_SKILLS) {
			expect(text).toContain(skill.name);
			expect(text).toContain(skill.repo);
		}
	});

	it("appends to existing README content and is idempotent on rerun", () => {
		const existing = "# Local skills\n\nKeep this section.\n";
		const first = mergeSkillsReadme(existing) as string;
		expect(first.startsWith(existing)).toBe(true);
		expect(mergeSkillsReadme(first)).toBeNull();
	});
});
