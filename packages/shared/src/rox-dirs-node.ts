import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
	LEGACY_PROJECT_ROX_DIR_NAME,
	LEGACY_ROX_HOME_DIR_NAME,
	PROJECT_ROX_DIR_NAME,
	ROX_HOME_DIR_NAME,
} from "./rox-dirs";

export {
	LEGACY_PROJECT_ROX_DIR_NAME,
	LEGACY_ROX_HOME_DIR_NAME,
	PROJECT_ROX_DIR_NAME,
	ROX_HOME_DIR_NAME,
} from "./rox-dirs";

/**
 * Derive the legacy dot-hidden home dir that corresponds to a visible Rox home.
 * Handles both production (`~/rox` -> `~/.rox`) and workspace-specific dev
 * homes (`~/rox-feature` -> `~/.rox-feature`).
 */
export function legacyRoxHomeDirFor(roxHomeDir: string): string | null {
	const dirName = basename(roxHomeDir);
	if (dirName === ROX_HOME_DIR_NAME) {
		return join(dirname(roxHomeDir), LEGACY_ROX_HOME_DIR_NAME);
	}
	if (dirName.startsWith(`${ROX_HOME_DIR_NAME}-`)) {
		return join(dirname(roxHomeDir), `.${dirName}`);
	}
	return null;
}

/**
 * Resolve a path below the Rox home for READING. Prefers the current visible
 * location, but falls back to the matching legacy dot-hidden location when the
 * exact requested path only exists there.
 */
export function resolveRoxHomePath(
	roxHomeDir: string,
	...segments: string[]
): string {
	const next = join(roxHomeDir, ...segments);
	if (existsSync(next)) return next;

	const legacyHomeDir = legacyRoxHomeDirFor(roxHomeDir);
	if (!legacyHomeDir) return next;

	const legacy = join(legacyHomeDir, ...segments);
	if (existsSync(legacy)) return legacy;
	return next;
}

/**
 * Resolve the per-workspace Rox dir for READING. Prefers the new `rox/` dir;
 * falls back to a legacy `.rox/` dir when only that exists. For WRITING new
 * content, prefer `PROJECT_ROX_DIR_NAME` directly (after `migrateRoxDir`).
 */
export function resolveProjectRoxDir(repoPath: string): string {
	const next = join(repoPath, PROJECT_ROX_DIR_NAME);
	if (existsSync(next)) return next;
	const legacy = join(repoPath, LEGACY_PROJECT_ROX_DIR_NAME);
	if (existsSync(legacy)) return legacy;
	return next;
}

/**
 * One-time, idempotent migration of a legacy dir to its visible counterpart.
 * Renames `legacyPath` -> `nextPath` when the legacy dir exists and the new one
 * does not. Falls back to a recursive copy on cross-device (EXDEV) or any
 * rename error. Never throws; returns whether a migration was performed.
 */
export function migrateRoxDir(legacyPath: string, nextPath: string): boolean {
	try {
		if (!existsSync(legacyPath)) return false;
		try {
			renameSync(legacyPath, nextPath);
			return true;
		} catch {
			if (existsSync(nextPath)) return false;
			// EXDEV or other rename failure: copy then best-effort remove the legacy dir.
			cpSync(legacyPath, nextPath, {
				recursive: true,
				force: false,
				errorOnExist: true,
			});
			try {
				rmSync(legacyPath, { recursive: true, force: true });
			} catch {
				// Leave the legacy dir in place; the new dir now exists and wins.
			}
			return true;
		}
	} catch {
		return false;
	}
}

/**
 * Migrate a workspace's `<repo>/.rox` -> `<repo>/rox` if needed. Safe to call on
 * every workspace open/create. Returns whether a migration was performed.
 */
export function migrateProjectRoxDir(repoPath: string): boolean {
	return migrateRoxDir(
		join(repoPath, LEGACY_PROJECT_ROX_DIR_NAME),
		join(repoPath, PROJECT_ROX_DIR_NAME),
	);
}
