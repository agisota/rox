#!/usr/bin/env bun
/**
 * Build the preinstall catalog archives (skills + subagents) from the curated
 * default skill set defined in @rox/shared. Replaces the legacy (now removed)
 * fetch-from-GitHub-release download of the 985-skill snapshot: instead of
 * pulling a giant catalog from a GitHub release, we shallow-clone exactly the
 * curated source repos and stage only the curated skills.
 *
 * Output (written into apps/desktop/resources/preinstall/):
 *   - skills.tar.gz   — top-level `skills/<name>/SKILL.md` (matches the runtime
 *                       extractor + preinstall-catalog.test.ts fixture shape)
 *   - agents.tar.gz   — top-level `agents/` (empty for the curated set ->
 *                       agents.count 0; the runtime extractor still reads it)
 *   - manifest.json   — version + per-archive {count, archive, sha256, bytes}
 *
 * FAIL-SOFT: a repo that cannot be cloned (offline CI, transient network) is
 * skipped, never breaks the build — mirroring the legacy fetch path. The
 * committed manifest.json reflects the last successful local build; the big
 * *.tar.gz files stay gitignored and are rebuilt at prebuild/prepackage time.
 *
 * Run automatically by the desktop `prebuild`/`prepackage` steps; safe by hand:
 *   bun run scripts/build-preinstall-catalog.ts
 */
import { createHash } from "node:crypto";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CURATED_DEFAULT_SKILLS } from "@rox/shared/skills/curated-default-skills";

const CATALOG_VERSION = "catalog-curated-v1";

const resourcesDir = join(import.meta.dirname, "..", "resources", "preinstall");
const manifestPath = join(resourcesDir, "manifest.json");

// Per-process build cache so repos shared by multiple skills are cloned once.
const cloneCacheRoot = join(
	tmpdir(),
	`rox-curated-catalog-${process.pid}-${Date.now()}`,
);
const stagingRoot = join(cloneCacheRoot, "staging");
const skillsStaging = join(stagingRoot, "skills");
const agentsStaging = join(stagingRoot, "agents");

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function repoUrl(repo: string): string {
	// repo is `github.com/<owner>/<name>` -> https clone URL.
	return `https://${repo}.git`;
}

function cacheDirFor(repo: string): string {
	return join(cloneCacheRoot, "repos", repo.replace(/[^a-zA-Z0-9._-]/g, "_"));
}

/** Recursively collect every SKILL.md path under a directory. */
function findSkillMds(root: string, acc: string[] = []): string[] {
	let entries: ReturnType<typeof readdirSync<{ withFileTypes: true }>>;
	try {
		entries = readdirSync(root, { withFileTypes: true });
	} catch {
		return acc;
	}
	for (const entry of entries) {
		const full = join(root, entry.name);
		if (entry.isDirectory()) {
			findSkillMds(full, acc);
		} else if (entry.isFile() && entry.name === "SKILL.md") {
			acc.push(full);
		}
	}
	return acc;
}

/**
 * Resolve the directory that holds the skill's SKILL.md for a curated entry.
 * Authoritative subpaths usually point straight at the skill dir, but some
 * source repos (e.g. alirezarezvani/claude-skills) nest the SKILL.md one level
 * deeper under `<subpath>/skills/<name>/`. Resolution priority:
 *   1. <subpath>/SKILL.md (direct)
 *   2. <subpath>/skills/<name>/SKILL.md (named nested skill)
 *   3. a single unambiguous SKILL.md anywhere under <subpath>
 * Ambiguous bundles (multiple SKILL.md, no name match) return null -> fail-soft.
 */
function resolveSkillDir(
	subpathDir: string,
	name: string,
): { dir: string; reason?: string } | null {
	if (existsSync(join(subpathDir, "SKILL.md"))) {
		return { dir: subpathDir };
	}
	const named = join(subpathDir, "skills", name);
	if (existsSync(join(named, "SKILL.md"))) {
		return { dir: named };
	}
	const all = findSkillMds(subpathDir);
	if (all.length === 1) {
		return { dir: dirname(all[0]) };
	}
	return null;
}

/** Shallow-clone a repo into the cache (once). Returns false on failure. */
async function ensureCloned(repo: string): Promise<boolean> {
	const dest = cacheDirFor(repo);
	if (existsSync(dest)) {
		return true;
	}
	try {
		await Bun.$`git clone --depth 1 --quiet ${repoUrl(repo)} ${dest}`.quiet();
		return existsSync(dest);
	} catch (error) {
		console.warn(
			`[build:catalog] ⚠ could not clone ${repo}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return false;
	}
}

async function main(): Promise<void> {
	// Fresh staging trees.
	rmSync(cloneCacheRoot, { recursive: true, force: true });
	mkdirSync(skillsStaging, { recursive: true });
	mkdirSync(agentsStaging, { recursive: true });

	const staged: string[] = [];
	const skipped: Array<{ name: string; repo: string; reason: string }> = [];
	// Repos we already failed to clone — don't retry per skill.
	const failedRepos = new Set<string>();

	for (const skill of CURATED_DEFAULT_SKILLS) {
		if (failedRepos.has(skill.repo)) {
			skipped.push({
				name: skill.name,
				repo: skill.repo,
				reason: "repo clone failed",
			});
			continue;
		}

		const cloned = await ensureCloned(skill.repo);
		if (!cloned) {
			failedRepos.add(skill.repo);
			skipped.push({
				name: skill.name,
				repo: skill.repo,
				reason: "repo clone failed",
			});
			continue;
		}

		const subpathDir = join(cacheDirFor(skill.repo), skill.subpath);
		if (!existsSync(subpathDir) || !statSync(subpathDir).isDirectory()) {
			skipped.push({
				name: skill.name,
				repo: skill.repo,
				reason: `subpath not found: ${skill.subpath}`,
			});
			continue;
		}

		const resolved = resolveSkillDir(subpathDir, skill.name);
		if (!resolved) {
			skipped.push({
				name: skill.name,
				repo: skill.repo,
				reason: `no unambiguous SKILL.md under ${skill.subpath}`,
			});
			continue;
		}

		const target = join(skillsStaging, skill.name);
		rmSync(target, { recursive: true, force: true });
		// Dereference symlinks: some source repos (e.g. the .gemini/skills/*
		// shadow dirs in alirezarezvani/claude-skills) ship SKILL.md as a
		// relative symlink into the canonical skill elsewhere in the same repo.
		// Copying the link verbatim would land a dangling link in ~/.claude;
		// dereferencing materializes the real files into staging.
		cpSync(resolved.dir, target, { recursive: true, dereference: true });

		// Guard: the staged skill MUST contain a real SKILL.md file. A dangling
		// symlink (target outside the clone) would otherwise slip through.
		const stagedSkillMd = join(target, "SKILL.md");
		if (!existsSync(stagedSkillMd) || !statSync(stagedSkillMd).isFile()) {
			rmSync(target, { recursive: true, force: true });
			skipped.push({
				name: skill.name,
				repo: skill.repo,
				reason: `staged SKILL.md unresolved (dangling link?) under ${skill.subpath}`,
			});
			continue;
		}
		staged.push(skill.name);
	}

	// Keep an empty agents/ dir tracked in the tar so the archive is valid even
	// when the curated set has no subagents.
	writeFileSync(join(agentsStaging, ".keep"), "");

	const skillsTar = join(resourcesDir, "skills.tar.gz");
	const agentsTar = join(resourcesDir, "agents.tar.gz");
	mkdirSync(resourcesDir, { recursive: true });

	await Bun.$`tar -czf ${skillsTar} -C ${stagingRoot} skills`;
	await Bun.$`tar -czf ${agentsTar} -C ${stagingRoot} agents`;

	const manifest = {
		version: CATALOG_VERSION,
		skills: {
			count: staged.length,
			archive: "skills.tar.gz",
			sha256: sha256(skillsTar),
			bytes: statSync(skillsTar).size,
		},
		agents: {
			count: 0,
			archive: "agents.tar.gz",
			sha256: sha256(agentsTar),
			bytes: statSync(agentsTar).size,
		},
	};
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);

	// Best-effort cleanup of the clone cache.
	rmSync(cloneCacheRoot, { recursive: true, force: true });

	console.log(
		`[build:catalog] staged ${staged.length}/${CURATED_DEFAULT_SKILLS.length} curated skills`,
	);
	if (skipped.length > 0) {
		console.warn(`[build:catalog] skipped ${skipped.length} (fail-soft):`);
		for (const s of skipped) {
			console.warn(`  - ${s.name} (${s.repo}): ${s.reason}`);
		}
	}
	console.log(
		`[build:catalog] wrote ${manifestPath} (version ${CATALOG_VERSION}, skills.count ${staged.length})`,
	);
}

await main();
