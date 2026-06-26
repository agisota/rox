import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, readlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CURATED_DEFAULT_SKILL_PACKS } from "@rox/shared/skills/curated-default-skills";
import {
	buildSkillsManifest,
	DEFAULT_SKILLS,
	mergeSkillsReadme,
	writeWorkspaceSkillsConfig,
} from "./setup-skills";

const DEFAULT_NAMES: readonly string[] = DEFAULT_SKILLS.map(
	(skill) => skill.name,
);

describe("DEFAULT_SKILLS", () => {
	it("derives the curated Rox preinstalled skill set from the shared constant", () => {
		expect([...DEFAULT_NAMES].sort()).toEqual(
			CURATED_DEFAULT_SKILL_PACKS.map((pack) => pack.name).sort(),
		);
		for (const skill of DEFAULT_SKILLS) {
			expect(skill.repo).toStartWith("github.com/");
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
		const [firstPack, secondPack] = CURATED_DEFAULT_SKILL_PACKS;
		if (!firstPack || !secondPack) {
			throw new Error("curated skill packs must have at least two entries");
		}
		const overriddenName = firstPack.name;
		const otherName = secondPack.name;
		const existing = JSON.stringify({
			skills: [
				{
					name: overriddenName,
					repo: "file://custom-override",
					description: "Custom local override",
				},
			],
		});
		const out = buildSkillsManifest(existing);
		const parsed = JSON.parse(out as string) as {
			skills: Array<{ name: string; repo: string; description?: string }>;
		};
		expect(
			parsed.skills.find((skill) => skill.name === overriddenName),
		).toEqual({
			name: overriddenName,
			repo: "file://custom-override",
			description: "Custom local override",
		});
		expect(parsed.skills.some((skill) => skill.name === otherName)).toBe(true);
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

describe("writeWorkspaceSkillsConfig (async loader)", () => {
	let worktreePath: string;

	beforeEach(async () => {
		worktreePath = await mkdtemp(join(tmpdir(), "rox-skills-"));
	});

	afterEach(async () => {
		await rm(worktreePath, { recursive: true, force: true });
	});

	it("seeds the manifest and README into .agents/skills matching the pure builders", async () => {
		await writeWorkspaceSkillsConfig(worktreePath);

		const skillsDir = join(worktreePath, ".agents", "skills");
		const manifest = await readFile(
			join(skillsDir, "rox-preinstalled-skills.json"),
			"utf-8",
		);
		const readme = await readFile(join(skillsDir, "README.md"), "utf-8");

		expect(manifest).toBe(buildSkillsManifest(null) as string);
		expect(readme).toBe(mergeSkillsReadme(null) as string);
		for (const skill of DEFAULT_SKILLS) {
			expect(manifest).toContain(skill.name);
			expect(readme).toContain(skill.name);
		}
	});

	it("links .claude/skills to ../.agents/skills", async () => {
		await writeWorkspaceSkillsConfig(worktreePath);

		const target = await readlink(join(worktreePath, ".claude", "skills"));
		expect(target).toBe("../.agents/skills");
	});

	it("is idempotent on rerun (stable manifest + README output)", async () => {
		await writeWorkspaceSkillsConfig(worktreePath);
		const skillsDir = join(worktreePath, ".agents", "skills");
		const manifestPath = join(skillsDir, "rox-preinstalled-skills.json");
		const readmePath = join(skillsDir, "README.md");
		const firstManifest = await readFile(manifestPath, "utf-8");
		const firstReadme = await readFile(readmePath, "utf-8");

		await writeWorkspaceSkillsConfig(worktreePath);

		expect(await readFile(manifestPath, "utf-8")).toBe(firstManifest);
		expect(await readFile(readmePath, "utf-8")).toBe(firstReadme);
	});
});
