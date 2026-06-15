import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Canonical names for Rox's app-runtime directories.
 *
 * The per-workspace config dir and the per-user home dir were historically
 * dot-hidden (`.rox`). They are now visible top-level folders (`rox`) so users
 * can find them. Existing installs keep working via the LEGACY_* fallbacks and
 * a one-time, idempotent migration (`migrateRoxDir`).
 *
 * NOTE: This does NOT cover the repo's own dev/CI tooling dir (`.rox/`,
 * `.rox/setup.local.sh`, etc.) — that is separate infra and intentionally
 * stays dot-hidden.
 */

/** Visible per-workspace config dir name (`<repo>/rox`). */
export const PROJECT_ROX_DIR_NAME = "rox";
/** Legacy dot-hidden per-workspace config dir name (`<repo>/.rox`). */
export const LEGACY_PROJECT_ROX_DIR_NAME = ".rox";

/** Visible per-user home dir name (`~/rox`). */
export const ROX_HOME_DIR_NAME = "rox";
/** Legacy dot-hidden per-user home dir name (`~/.rox`). */
export const LEGACY_ROX_HOME_DIR_NAME = ".rox";

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
		if (!existsSync(legacyPath) || existsSync(nextPath)) return false;
		try {
			renameSync(legacyPath, nextPath);
			return true;
		} catch {
			// EXDEV or other rename failure: copy then best-effort remove the legacy dir.
			cpSync(legacyPath, nextPath, { recursive: true });
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
