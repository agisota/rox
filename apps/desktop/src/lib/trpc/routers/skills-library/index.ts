import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
	type Dirent,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import {
	CURATED_DEFAULT_SKILL_PACKS,
	CURATED_DEFAULT_SKILLS,
} from "@rox/shared/skills/curated-default-skills";
import { TRPCError } from "@trpc/server";
import { app } from "electron";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	createFile as createFileInSkill,
	createSkill as createSkillDir,
	deleteFile as deleteFileInSkill,
	deleteSkill as deleteSkillDir,
	duplicateSkill as duplicateSkillDir,
	renameFile as renameFileInSkill,
} from "./lifecycle";

const execFileAsync = promisify(execFile);

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

/** Where skills are installed when a user installs from the catalog. */
const CLAUDE_SKILLS_ROOT = join(homedir(), ".claude", "skills");

/**
 * Resolve the bundled preinstall resources directory (manifest.json +
 * skills.tar.gz). Mirrors the main-process startup path
 * (`apps/desktop/src/main/index.ts`) so installs use the exact same bundled
 * archive that seeds `~/.claude/skills` on first launch — no network fetch.
 */
function preinstallResourcesDir(): string {
	return app.isPackaged
		? join(process.resourcesPath, "resources/preinstall")
		: join(app.getAppPath(), "resources/preinstall");
}

/**
 * The curated skill directory names that belong to a catalog pack (one pack ==
 * one source repo). The bundled archive stores each skill flattened as a
 * top-level `skills/<name>/` directory, so installing a pack means landing all
 * of its curated skills under `~/.claude/skills/<name>`.
 */
function curatedSkillNamesForPack(repo: string): string[] {
	return CURATED_DEFAULT_SKILLS.filter((skill) => skill.repo === repo).map(
		(skill) => skill.name,
	);
}

interface InstallPackResult {
	/** Skill directory names newly landed (or refreshed) under ~/.claude/skills. */
	installed: string[];
	/** Curated skills for this pack that the bundled archive did not contain. */
	skipped: string[];
}

/**
 * Install one curated pack from the bundled archive into `~/.claude/skills`.
 *
 * Extracts `skills.tar.gz` into a temp staging dir, then moves only the pack's
 * curated skill directories into place (replacing any existing copy). This is
 * the same mechanism the startup catalog seeder uses, scoped to a single pack
 * and confined to the Claude skills root. Throws a user-facing TRPCError when
 * the bundled archive is unavailable (e.g. a dev build that never ran the
 * `build:catalog` prebuild step) so the UI can report honestly.
 */
async function installCuratedPack(repo: string): Promise<InstallPackResult> {
	const wanted = new Set(curatedSkillNamesForPack(repo));
	if (wanted.size === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Этот пакет не содержит навыков для установки",
		});
	}

	const archivePath = join(preinstallResourcesDir(), "skills.tar.gz");
	if (!existsSync(archivePath)) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"Архив со скиллами не собран в этой сборке. Запустите `bun run scripts/build-preinstall-catalog.ts` в apps/desktop.",
		});
	}

	mkdirSync(CLAUDE_SKILLS_ROOT, { recursive: true });
	// Stage on the same volume as the install root so the final rename is atomic.
	const stage = mkdtempSync(join(CLAUDE_SKILLS_ROOT, ".rox-install-stage-"));
	try {
		await execFileAsync("tar", ["-xzf", archivePath, "-C", stage]);
		// Archive layout: top-level `skills/<name>/...`.
		const stagedSkillsDir = join(stage, "skills");
		const installed: string[] = [];
		let staged: Dirent<string>[] = [];
		try {
			staged = readdirSync(stagedSkillsDir, { withFileTypes: true });
		} catch {
			staged = [];
		}
		const stagedByName = new Map(
			staged
				.filter((entry) => entry.isDirectory())
				.map((entry) => [entry.name, entry] as const),
		);

		for (const name of wanted) {
			const entry = stagedByName.get(name);
			if (!entry) continue;
			// Path-traversal guard: never let a skill name escape the root.
			const dest = resolve(CLAUDE_SKILLS_ROOT, name);
			if (!dest.startsWith(CLAUDE_SKILLS_ROOT + sep)) continue;
			rmSync(dest, { recursive: true, force: true });
			renameSync(join(stagedSkillsDir, name), dest);
			installed.push(name);
		}

		const skipped = [...wanted].filter((name) => !installed.includes(name));
		if (installed.length === 0) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message:
					"Навыки этого пакета отсутствуют в собранном архиве (fail-soft при сборке).",
			});
		}
		return { installed: installed.sort(), skipped: skipped.sort() };
	} finally {
		rmSync(stage, { recursive: true, force: true });
	}
}

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
		let entries: Dirent<string>[];
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

/**
 * Resolve a skill dir and assert it lives in a writable root. Only
 * `~/.claude/skills` is writable; `~/.agents/skills` stays read-only so the
 * desktop never mutates skills it does not own.
 */
function resolveWritableSkillDir(id: string): {
	source: SkillSource;
	dir: string;
} {
	const resolved = resolveSkillDir(id);
	if (resolved.source !== "claude") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message:
				"Скиллы из ~/.agents доступны только для чтения. Редактирование возможно в ~/.claude/skills.",
		});
	}
	return resolved;
}

/** Content hash + mtime for optimistic-concurrency (save-conflict) checks. */
function fileVersion(target: string): { mtimeMs: number; hash: string } {
	const stat = statSync(target);
	const hash = createHash("sha256").update(readFileSync(target)).digest("hex");
	return { mtimeMs: stat.mtimeMs, hash };
}

export const createSkillsLibraryRouter = () => {
	return router({
		list: publicProcedure.query((): SkillSummary[] => {
			const skills: SkillSummary[] = [];
			const seen = new Set<string>();
			for (const root of SKILL_ROOTS) {
				if (!existsSync(root.path)) continue;
				let entries: Dirent<string>[];
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
			.query(
				({
					input,
				}): {
					relativePath: string;
					content: string;
					mtimeMs: number;
					hash: string;
				} => {
					const { dir } = resolveSkillDir(input.id);
					const target = resolveSkillFile(dir, input.relativePath);
					if (!existsSync(target) || !statSync(target).isFile()) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "File not found",
						});
					}
					if (statSync(target).size > MAX_FILE_BYTES) {
						throw new TRPCError({
							code: "PAYLOAD_TOO_LARGE",
							message: "File too large to open in the editor",
						});
					}
					const { mtimeMs, hash } = fileVersion(target);
					return {
						relativePath: input.relativePath,
						content: readFileSync(target, "utf-8"),
						mtimeMs,
						hash,
					};
				},
			),

		writeFile: publicProcedure
			.input(
				z.object({
					id: z.string(),
					relativePath: z.string(),
					content: z.string(),
					/**
					 * Hash of the content this edit was based on. When present and the
					 * file on disk no longer matches, the write is rejected with a
					 * CONFLICT so an external change is never silently clobbered.
					 */
					baseHash: z.string().optional(),
				}),
			)
			.mutation(
				({
					input,
				}): { relativePath: string; mtimeMs: number; hash: string } => {
					const { dir } = resolveWritableSkillDir(input.id);
					const target = resolveSkillFile(dir, input.relativePath);
					if (!existsSync(target) || !statSync(target).isFile()) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Cannot create new files from the editor",
						});
					}
					// Optimistic concurrency: bail if the on-disk content drifted from
					// what the editor loaded, so a concurrent external edit isn't lost.
					if (input.baseHash !== undefined) {
						const current = fileVersion(target);
						if (current.hash !== input.baseHash) {
							throw new TRPCError({
								code: "CONFLICT",
								message:
									"Файл изменился на диске после открытия. Перезагрузите или перезапишите.",
							});
						}
					}
					writeFileSync(target, input.content, "utf-8");
					const { mtimeMs, hash } = fileVersion(target);
					return { relativePath: input.relativePath, mtimeMs, hash };
				},
			),

		createSkill: publicProcedure
			.input(z.object({ name: z.string().min(1) }))
			.mutation(({ input }): { id: string; slug: string } => {
				const slug = createSkillDir(CLAUDE_SKILLS_ROOT, input.name);
				return { id: `claude:${slug}`, slug };
			}),

		deleteSkill: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }): { id: string } => {
				const { dir } = resolveWritableSkillDir(input.id);
				deleteSkillDir(CLAUDE_SKILLS_ROOT, dir);
				return { id: input.id };
			}),

		duplicateSkill: publicProcedure
			.input(z.object({ id: z.string(), newName: z.string().min(1) }))
			.mutation(({ input }): { id: string; slug: string } => {
				const { dir } = resolveSkillDir(input.id);
				const slug = duplicateSkillDir(CLAUDE_SKILLS_ROOT, dir, input.newName);
				return { id: `claude:${slug}`, slug };
			}),

		createFile: publicProcedure
			.input(z.object({ id: z.string(), relativePath: z.string().min(1) }))
			.mutation(({ input }): { relativePath: string } => {
				const { dir } = resolveWritableSkillDir(input.id);
				const relativePath = createFileInSkill(dir, input.relativePath);
				return { relativePath };
			}),

		deleteFile: publicProcedure
			.input(z.object({ id: z.string(), relativePath: z.string().min(1) }))
			.mutation(({ input }): { relativePath: string } => {
				const { dir } = resolveWritableSkillDir(input.id);
				deleteFileInSkill(dir, input.relativePath);
				return { relativePath: input.relativePath };
			}),

		renameFile: publicProcedure
			.input(
				z.object({
					id: z.string(),
					from: z.string().min(1),
					to: z.string().min(1),
				}),
			)
			.mutation(({ input }): { relativePath: string } => {
				const { dir } = resolveWritableSkillDir(input.id);
				const relativePath = renameFileInSkill(dir, input.from, input.to);
				return { relativePath };
			}),

		/**
		 * Install a curated catalog pack from the bundled archive into
		 * `~/.claude/skills`. `slug` is the catalog pack name; it is validated
		 * against the curated pack allowlist so only known packs can be installed.
		 */
		install: publicProcedure
			.input(z.object({ slug: z.string().min(1) }))
			.mutation(
				async ({
					input,
				}): Promise<{
					slug: string;
					source: SkillSource;
					installed: string[];
					skipped: string[];
				}> => {
					const pack = CURATED_DEFAULT_SKILL_PACKS.find(
						(candidate) => candidate.name === input.slug,
					);
					if (!pack) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Неизвестный пакет скиллов",
						});
					}
					const { installed, skipped } = await installCuratedPack(pack.repo);
					return { slug: pack.name, source: "claude", installed, skipped };
				},
			),
	});
};
