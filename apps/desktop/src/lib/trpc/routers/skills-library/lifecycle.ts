/**
 * Skill/file lifecycle core (Skills library — issue #560).
 *
 * Pure-ish filesystem helpers behind the local electron-tRPC `skillsLibrary`
 * mutations: create/delete/rename files and create/delete/duplicate skills,
 * plus a SKILL.md scaffold whose frontmatter matches `anthropics/skills` (the
 * exact `name`/`description` shape `lib/frontmatter.ts` parses and
 * `seedWorkspaceSkills`/Claude Code expect).
 *
 * Every path is funnelled through the same traversal guard as the existing
 * router and confined to the Claude skills root — `~/.agents/skills` stays
 * read-only. The functions take their roots as arguments (no `electron`
 * import) so they are unit-testable without the app runtime.
 */

import {
	cpSync,
	type Dirent,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { TRPCError } from "@trpc/server";

/** Max files a single skill may hold (mirrors the router's listing cap). */
export const MAX_SKILL_FILES = 200;

/**
 * Validate a skill directory name: a single path segment, no traversal, no
 * separators, no leading dot. Returns the trimmed slug or throws a user-facing
 * error. This is the only name the caller is allowed to join onto a root.
 */
export function validateSkillName(rawName: string): string {
	const name = rawName.trim();
	if (name.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Имя скилла не может быть пустым",
		});
	}
	if (name.length > 100) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Имя скилла слишком длинное (максимум 100 символов)",
		});
	}
	if (name.startsWith(".")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Имя скилла не может начинаться с точки",
		});
	}
	if (/[\\/]/.test(name) || name.includes("..")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Имя скилла не может содержать слэши или «..»",
		});
	}
	// Keep names filesystem-portable (Claude Code skill dirs are kebab-ish).
	if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(name)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Имя скилла может содержать буквы, цифры, пробел, дефис, точку и подчёркивание",
		});
	}
	return name;
}

/**
 * Resolve a relative file path inside a skill dir, rejecting traversal and
 * absolute paths. Mirrors the router's `resolveSkillFile` but is shared so the
 * lifecycle mutations enforce the identical boundary.
 */
export function resolveInside(baseDir: string, relativePath: string): string {
	const trimmed = relativePath.trim();
	if (trimmed.length === 0) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Пустой путь файла" });
	}
	const target = resolve(baseDir, trimmed);
	if (target !== baseDir && !target.startsWith(baseDir + sep)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Путь выходит за пределы каталога скилла",
		});
	}
	if (target === baseDir) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Путь должен указывать на файл внутри скилла",
		});
	}
	return target;
}

/** Count regular files under a directory (for the per-skill file cap). */
function countFiles(dir: string): number {
	let count = 0;
	const walk = (current: string) => {
		let entries: Dirent<string>[];
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const abs = join(current, entry.name);
			if (entry.isDirectory()) walk(abs);
			else if (entry.isFile()) count += 1;
		}
	};
	walk(dir);
	return count;
}

/**
 * Build a fresh SKILL.md whose frontmatter is exactly the `name`/`description`
 * pair the rest of the library round-trips (see `lib/frontmatter.ts`). The
 * description starts as a placeholder the user is expected to edit.
 */
export function scaffoldSkillMd(name: string): string {
	const description = `TODO: опишите, когда применять навык «${name}».`;
	return [
		"---",
		`name: ${name}`,
		`description: ${description}`,
		"---",
		"",
		`# ${name}`,
		"",
		"Опишите здесь, что делает навык и как его использовать.",
		"",
	].join("\n");
}

/** Assert that a target dir lives under (or is) the writable Claude root. */
function assertUnderRoot(root: string, target: string): void {
	const rootResolved = resolve(root);
	if (target !== rootResolved && !target.startsWith(rootResolved + sep)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Операция вне разрешённого каталога",
		});
	}
}

/**
 * Create a new skill directory under the Claude root with a scaffolded
 * SKILL.md. Returns the new directory's slug. Throws CONFLICT if it exists.
 */
export function createSkill(claudeRoot: string, rawName: string): string {
	const name = validateSkillName(rawName);
	mkdirSync(claudeRoot, { recursive: true });
	const dir = resolve(claudeRoot, name);
	assertUnderRoot(claudeRoot, dir);
	if (existsSync(dir)) {
		throw new TRPCError({
			code: "CONFLICT",
			message: `Скилл «${name}» уже существует`,
		});
	}
	mkdirSync(dir, { recursive: false });
	writeFileSync(join(dir, "SKILL.md"), scaffoldSkillMd(name), "utf-8");
	return name;
}

/** Delete an entire skill directory (recursive). */
export function deleteSkill(claudeRoot: string, skillDir: string): void {
	assertUnderRoot(claudeRoot, skillDir);
	if (resolve(skillDir) === resolve(claudeRoot)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Нельзя удалить корень каталога",
		});
	}
	rmSync(skillDir, { recursive: true, force: true });
}

/**
 * Duplicate a skill directory into a new sibling under the Claude root, then
 * rewrite the copy's SKILL.md `name` to the new slug so the two skills do not
 * collide in the catalog. Returns the new slug.
 */
export function duplicateSkill(
	claudeRoot: string,
	sourceDir: string,
	rawNewName: string,
): string {
	const newName = validateSkillName(rawNewName);
	const dest = resolve(claudeRoot, newName);
	assertUnderRoot(claudeRoot, dest);
	if (existsSync(dest)) {
		throw new TRPCError({
			code: "CONFLICT",
			message: `Скилл «${newName}» уже существует`,
		});
	}
	cpSync(sourceDir, dest, { recursive: true });
	// Best-effort: align the duplicated SKILL.md name with its new directory.
	const skillMd = join(dest, "SKILL.md");
	if (existsSync(skillMd)) {
		try {
			const content = readFileSync(skillMd, "utf-8");
			const rewritten = content.replace(/^(name:\s*).*$/m, `$1${newName}`);
			writeFileSync(skillMd, rewritten, "utf-8");
		} catch {
			// Non-fatal: the copy still works, only the in-file name lags.
		}
	}
	return newName;
}

/** Create a new (empty) file inside a skill, honouring the file cap. */
export function createFile(skillDir: string, relativePath: string): string {
	const target = resolveInside(skillDir, relativePath);
	if (existsSync(target)) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Файл уже существует",
		});
	}
	if (countFiles(skillDir) >= MAX_SKILL_FILES) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Достигнут лимит файлов в скилле (${MAX_SKILL_FILES})`,
		});
	}
	mkdirSync(resolve(target, ".."), { recursive: true });
	writeFileSync(target, "", "utf-8");
	return relativePath.trim();
}

/** Delete a single file inside a skill. */
export function deleteFile(skillDir: string, relativePath: string): void {
	const target = resolveInside(skillDir, relativePath);
	if (!existsSync(target) || !statSync(target).isFile()) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Файл не найден" });
	}
	rmSync(target, { force: true });
}

/** Rename/move a file inside a skill (both sides traversal-checked). */
export function renameFile(
	skillDir: string,
	fromRelative: string,
	toRelative: string,
): string {
	const from = resolveInside(skillDir, fromRelative);
	const to = resolveInside(skillDir, toRelative);
	if (!existsSync(from) || !statSync(from).isFile()) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Исходный файл не найден",
		});
	}
	if (existsSync(to)) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Файл назначения уже существует",
		});
	}
	mkdirSync(resolve(to, ".."), { recursive: true });
	renameSync(from, to);
	return toRelative.trim();
}
