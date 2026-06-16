import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Skills Library — reads the agent/workspace skills installed on this machine
 * (the same directories host-service WorkspaceSkills seeds into:
 * `~/.claude/skills` and `~/.agents/skills`). Backs the "Библиотека скиллов"
 * sidebar view: list installed skills with their name/description/SKILL.md and
 * other files, then view and edit those files in place.
 *
 * Reads/writes are confined to the known skills roots; path traversal outside a
 * skill directory is rejected.
 */

type SkillSource = "claude" | "agents";

interface SkillSummary {
	/** Stable id: `${source}:${dirName}`. */
	id: string;
	/** Directory name of the skill. */
	slug: string;
	/** `name` from SKILL.md frontmatter, falling back to the slug. */
	name: string;
	/** `description` from SKILL.md frontmatter, if present. */
	description: string | null;
	/** Which root this skill came from. */
	source: SkillSource;
	/** Absolute path to the skill directory. */
	absolutePath: string;
	/** Whether the skill directory has a SKILL.md. */
	hasSkillMd: boolean;
}

interface SkillFile {
	/** Path relative to the skill directory (POSIX-style). */
	relativePath: string;
	/** File size in bytes. */
	size: number;
}

interface SkillDetail extends SkillSummary {
	/** Raw SKILL.md content, if present. */
	skillMd: string | null;
	/** All regular files inside the skill directory. */
	files: SkillFile[];
}

const SKILL_ROOTS: ReadonlyArray<{ source: SkillSource; path: string }> = [
	{ source: "claude", path: join(homedir(), ".claude", "skills") },
	{ source: "agents", path: join(homedir(), ".agents", "skills") },
];

const MAX_FILE_BYTES = 512 * 1024;
const MAX_SKILL_FILES = 200;

function parseFrontmatter(content: string): {
	name?: string;
	description?: string;
} {
	if (!content.startsWith("---")) return {};
	const end = content.indexOf("\n---", 3);
	if (end === -1) return {};
	const block = content.slice(3, end);
	const result: { name?: string; description?: string } = {};
	for (const line of block.split("\n")) {
		const match = /^(name|description):\s*(.*)$/.exec(line.trim());
		if (!match) continue;
		const key = match[1] as "name" | "description";
		let value = match[2].trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (value.length > 0 && result[key] === undefined) {
			result[key] = value;
		}
	}
	return result;
}

function readSkillMd(skillDir: string): string | null {
	const skillMdPath = join(skillDir, "SKILL.md");
	if (!existsSync(skillMdPath)) return null;
	try {
		return readFileSync(skillMdPath, "utf-8");
	} catch {
		return null;
	}
}

function summarizeSkill(
	source: SkillSource,
	skillDir: string,
	slug: string,
): SkillSummary {
	const skillMd = readSkillMd(skillDir);
	const front = skillMd ? parseFrontmatter(skillMd) : {};
	return {
		id: `${source}:${slug}`,
		slug,
		name: front.name && front.name.length > 0 ? front.name : slug,
		description: front.description ?? null,
		source,
		absolutePath: skillDir,
		hasSkillMd: skillMd !== null,
	};
}

function listSkillFiles(skillDir: string): SkillFile[] {
	const files: SkillFile[] = [];
	const walk = (dir: string) => {
		if (files.length >= MAX_SKILL_FILES) return;
		let entries: ReturnType<typeof readdirSync>;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (files.length >= MAX_SKILL_FILES) return;
			if (entry.name.startsWith(".")) continue;
			const abs = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(abs);
			} else if (entry.isFile()) {
				let size = 0;
				try {
					size = statSync(abs).size;
				} catch {
					size = 0;
				}
				files.push({
					relativePath: relative(skillDir, abs).split(sep).join("/"),
					size,
				});
			}
		}
	};
	walk(skillDir);
	files.sort((a, b) => {
		if (a.relativePath === "SKILL.md") return -1;
		if (b.relativePath === "SKILL.md") return 1;
		return a.relativePath.localeCompare(b.relativePath);
	});
	return files;
}

function resolveSkillDir(id: string): { source: SkillSource; dir: string } {
	const separatorIndex = id.indexOf(":");
	if (separatorIndex === -1) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid skill id" });
	}
	const source = id.slice(0, separatorIndex) as SkillSource;
	const slug = id.slice(separatorIndex + 1);
	const root = SKILL_ROOTS.find((entry) => entry.source === source);
	if (!root || slug.length === 0) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown skill" });
	}
	const dir = resolve(root.path, slug);
	const rootResolved = resolve(root.path);
	if (dir !== rootResolved && !dir.startsWith(rootResolved + sep)) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Path outside root" });
	}
	if (!existsSync(dir) || !statSync(dir).isDirectory()) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });
	}
	return { source, dir };
}

/** Resolve a relative file path inside a skill dir, rejecting traversal. */
function resolveSkillFile(skillDir: string, relativePath: string): string {
	const target = resolve(skillDir, relativePath);
	if (target !== skillDir && !target.startsWith(skillDir + sep)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Path outside skill directory",
		});
	}
	return target;
}

export const createSkillsLibraryRouter = () => {
	return router({
		list: publicProcedure.query((): SkillSummary[] => {
			const skills: SkillSummary[] = [];
			const seen = new Set<string>();
			for (const root of SKILL_ROOTS) {
				if (!existsSync(root.path)) continue;
				let entries: ReturnType<typeof readdirSync>;
				try {
					entries = readdirSync(root.path, { withFileTypes: true });
				} catch {
					continue;
				}
				for (const entry of entries) {
					if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
					const id = `${root.source}:${entry.name}`;
					if (seen.has(id)) continue;
					seen.add(id);
					skills.push(
						summarizeSkill(
							root.source,
							join(root.path, entry.name),
							entry.name,
						),
					);
				}
			}
			skills.sort((a, b) => a.name.localeCompare(b.name));
			return skills;
		}),

		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }): SkillDetail => {
				const { source, dir } = resolveSkillDir(input.id);
				const slug = input.id.slice(input.id.indexOf(":") + 1);
				return {
					...summarizeSkill(source, dir, slug),
					skillMd: readSkillMd(dir),
					files: listSkillFiles(dir),
				};
			}),

		readFile: publicProcedure
			.input(z.object({ id: z.string(), relativePath: z.string() }))
			.query(({ input }): { relativePath: string; content: string } => {
				const { dir } = resolveSkillDir(input.id);
				const target = resolveSkillFile(dir, input.relativePath);
				if (!existsSync(target) || !statSync(target).isFile()) {
					throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
				}
				if (statSync(target).size > MAX_FILE_BYTES) {
					throw new TRPCError({
						code: "PAYLOAD_TOO_LARGE",
						message: "File too large to open in the editor",
					});
				}
				return {
					relativePath: input.relativePath,
					content: readFileSync(target, "utf-8"),
				};
			}),

		writeFile: publicProcedure
			.input(
				z.object({
					id: z.string(),
					relativePath: z.string(),
					content: z.string(),
				}),
			)
			.mutation(({ input }): { relativePath: string } => {
				const { dir } = resolveSkillDir(input.id);
				const target = resolveSkillFile(dir, input.relativePath);
				if (!existsSync(target) || !statSync(target).isFile()) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Cannot create new files from the editor",
					});
				}
				writeFileSync(target, input.content, "utf-8");
				return { relativePath: input.relativePath };
			}),
	});
};
