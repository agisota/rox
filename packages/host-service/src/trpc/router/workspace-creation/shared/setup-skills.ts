import {
	lstat,
	mkdir,
	readFile,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";

type DefaultWorkspaceSkill = {
	name: string;
	repo: `github.com/plannotator/${string}`;
	description: string;
};

export const DEFAULT_SKILLS = [
	{
		name: "dev-skills",
		repo: "github.com/plannotator/dev-skills",
		description: "Набор инженерных навыков для повседневной разработки.",
	},
	{
		name: "effective-html",
		repo: "github.com/plannotator/effective-html",
		description: "Навык для чистой, доступной и эффективной HTML-разметки.",
	},
	{
		name: "markdown-editor",
		repo: "github.com/plannotator/markdown-editor",
		description: "Навык редактирования и форматирования Markdown.",
	},
] as const satisfies readonly DefaultWorkspaceSkill[];

const SKILLS_MANIFEST_FILE = "rox-preinstalled-skills.json";
const SKILLS_README_FILE = "README.md";
const SKILLS_MARKER_BEGIN = "<!-- >>> rox default skills >>>";
const SKILLS_MARKER_END = "<!-- <<< rox default skills <<< -->";

type WorkspaceSkillManifestSkill = {
	name: string;
	[key: string]: unknown;
};

type WorkspaceSkillsManifest = {
	$schema?: string;
	managedBy?: string;
	preinstalled?: boolean;
	skills?: unknown;
	[key: string]: unknown;
};

type SeedWorkspaceSkillsArgs = {
	ctx: HostServiceContext;
	workspaceId: string;
};

type SeedWorkspaceSkillsResult = {
	warning: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNamedManifestSkill(
	value: unknown,
): value is WorkspaceSkillManifestSkill {
	return isRecord(value) && typeof value.name === "string";
}

function defaultManifestSkill(
	skill: DefaultWorkspaceSkill,
): WorkspaceSkillManifestSkill {
	return {
		name: skill.name,
		repo: skill.repo,
		description: skill.description,
		preinstalled: true,
		bundled: false,
		sourceType: "github",
		installState: "reference-only",
	};
}

export function buildSkillsManifest(existing: string | null): string | null {
	let manifest: WorkspaceSkillsManifest = {};
	if (existing && existing.trim().length > 0) {
		try {
			const parsed = JSON.parse(existing);
			if (isRecord(parsed)) {
				manifest = parsed;
			}
		} catch {
			manifest = {};
		}
	}

	const skills = Array.isArray(manifest.skills)
		? manifest.skills.filter(isNamedManifestSkill)
		: [];
	const existingNames = new Set(skills.map((skill) => skill.name));

	let added = false;
	for (const skill of DEFAULT_SKILLS) {
		if (existingNames.has(skill.name)) {
			continue;
		}
		skills.push(defaultManifestSkill(skill));
		existingNames.add(skill.name);
		added = true;
	}

	if (!added && existing !== null) {
		return null;
	}

	const next: WorkspaceSkillsManifest = {
		...manifest,
		managedBy: "rox",
		preinstalled: true,
		skills,
	};
	return `${JSON.stringify(next, null, 2)}\n`;
}

function defaultSkillsReadmeBlock(): string {
	const rows = DEFAULT_SKILLS.map(
		(skill) =>
			`| ${skill.name} | ${skill.repo} | reference-only | ${skill.description} |`,
	);
	return [
		SKILLS_MARKER_BEGIN,
		"# Rox preinstalled skills",
		"",
		"These reference-only skills are preinstalled by Rox workspace creation so the Навыки tab can show them before bundled archives are available.",
		"",
		"| Skill | Source | Install state | Description |",
		"| --- | --- | --- | --- |",
		...rows,
		SKILLS_MARKER_END,
	].join("\n");
}

export function mergeSkillsReadme(existing: string | null): string | null {
	const base = existing ?? "";
	if (base.includes(SKILLS_MARKER_BEGIN)) {
		return null;
	}

	const block = defaultSkillsReadmeBlock();
	if (base.trim().length === 0) {
		return `${block}\n`;
	}

	const separator = base.endsWith("\n") ? "\n" : "\n\n";
	return `${base}${separator}${block}\n`;
}

/**
 * Run async tasks with a bounded number in flight at once, preserving input
 * order in the returned results. Keeps the event loop responsive when the
 * skills fan-out grows beyond the current two directories.
 */
async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	const workerCount = Math.max(1, Math.min(limit, items.length));
	const workers = Array.from({ length: workerCount }, async () => {
		while (true) {
			const index = cursor++;
			if (index >= items.length) {
				return;
			}
			results[index] = await task(items[index] as T, index);
		}
	});
	await Promise.all(workers);
	return results;
}

const SKILLS_DIRECTORY_CONCURRENCY = 4;

async function readOptionalFile(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

async function writeSkillsDirectory(skillsPath: string): Promise<void> {
	await mkdir(skillsPath, { recursive: true });

	const manifestPath = join(skillsPath, SKILLS_MANIFEST_FILE);
	const existingManifest = await readOptionalFile(manifestPath);
	const nextManifest = buildSkillsManifest(existingManifest);
	if (nextManifest !== null) {
		await writeFile(manifestPath, nextManifest, "utf-8");
	}

	const readmePath = join(skillsPath, SKILLS_README_FILE);
	const existingReadme = await readOptionalFile(readmePath);
	const nextReadme = mergeSkillsReadme(existingReadme);
	if (nextReadme !== null) {
		await writeFile(readmePath, nextReadme, "utf-8");
	}
}

async function ensureClaudeSkillsPath(
	worktreePath: string,
): Promise<string | null> {
	const claudePath = join(worktreePath, ".claude");
	const claudeSkillsPath = join(claudePath, "skills");
	let linkStat: Awaited<ReturnType<typeof lstat>> | null = null;
	try {
		linkStat = await lstat(claudeSkillsPath);
	} catch {
		linkStat = null;
	}

	if (linkStat) {
		if (linkStat.isDirectory() && !linkStat.isSymbolicLink()) {
			return claudeSkillsPath;
		}
		return null;
	}

	await mkdir(claudePath, { recursive: true });
	await symlink("../.agents/skills", claudeSkillsPath, "dir");
	return null;
}

export async function writeWorkspaceSkillsConfig(
	worktreePath: string,
): Promise<void> {
	const agentsSkillsPath = join(worktreePath, ".agents", "skills");
	const claudeSkillsPath = await ensureClaudeSkillsPath(worktreePath);

	const skillDirectories = [agentsSkillsPath];
	if (claudeSkillsPath) {
		skillDirectories.push(claudeSkillsPath);
	}

	await mapWithConcurrency(
		skillDirectories,
		SKILLS_DIRECTORY_CONCURRENCY,
		(directory) => writeSkillsDirectory(directory),
	);
}

/**
 * Seed reference metadata for Rox default skills into a freshly-created
 * workspace. Mirrors MCP seeding: idempotent, best-effort, and never blocks
 * workspace creation when local filesystem writes fail.
 */
export async function seedWorkspaceSkills(
	args: SeedWorkspaceSkillsArgs,
): Promise<SeedWorkspaceSkillsResult> {
	const row = args.ctx.db
		.select({ worktreePath: workspaces.worktreePath })
		.from(workspaces)
		.where(eq(workspaces.id, args.workspaceId))
		.get();

	if (!row || !row.worktreePath) {
		return { warning: null };
	}

	const worktreePath = row.worktreePath;
	try {
		await stat(worktreePath);
	} catch {
		return { warning: null };
	}

	try {
		await writeWorkspaceSkillsConfig(worktreePath);
		return { warning: null };
	} catch (error) {
		return {
			warning: `Failed to seed Rox skills: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
}
