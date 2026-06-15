import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ROX_HOME_DIR_NAME } from "@rox/shared/rox-dirs";
import { migrateRoxDir } from "@rox/shared/rox-dirs-node";
import { ROX_DIR_NAME } from "shared/constants";

const ROX_HOME_DIR_ENV = "ROX_HOME_DIR";

/**
 * One-time migration of the legacy dot-hidden `~/.rox` home dir to the new
 * visible `~/rox` (or `~/rox-<workspace>`). Runs at module load — before
 * `ROX_HOME_DIR` is computed and before anything reads it — only when no
 * `ROX_HOME_DIR` override is set and the target does not already exist, so the
 * user's `config.json` (auth token) is preserved, never clobbered. Idempotent
 * and best-effort. The legacy `.rox-<workspace>` dev dirs are not migrated;
 * they are disposable per-worktree copies that get recreated.
 */
if (!process.env[ROX_HOME_DIR_ENV] && ROX_DIR_NAME === ROX_HOME_DIR_NAME) {
	const migrated = migrateRoxDir(
		join(homedir(), ".rox"),
		join(homedir(), ROX_DIR_NAME),
	);
	if (migrated) {
		console.info(
			`[app-environment] Migrated legacy ~/.rox to ~/${ROX_DIR_NAME}`,
		);
	}
}

export const ROX_HOME_DIR =
	process.env[ROX_HOME_DIR_ENV] || join(homedir(), ROX_DIR_NAME);
process.env[ROX_HOME_DIR_ENV] = ROX_HOME_DIR;

export const ROX_HOME_DIR_MODE = 0o700;
export const ROX_SENSITIVE_FILE_MODE = 0o600;

export function ensureRoxHomeDirExists(): void {
	if (!existsSync(ROX_HOME_DIR)) {
		mkdirSync(ROX_HOME_DIR, {
			recursive: true,
			mode: ROX_HOME_DIR_MODE,
		});
	}

	// Best-effort repair if the directory already existed with weak permissions.
	try {
		chmodSync(ROX_HOME_DIR, ROX_HOME_DIR_MODE);
	} catch (error) {
		console.warn(
			"[app-environment] Failed to chmod Rox home dir (best-effort):",
			ROX_HOME_DIR,
			error,
		);
	}
}

// For lowdb - use our own path instead of app.getPath("userData")
export const APP_STATE_PATH = join(ROX_HOME_DIR, "app-state.json");

// Window geometry state (separate from UI state - main process only, sync I/O)
export const WINDOW_STATE_PATH = join(ROX_HOME_DIR, "window-state.json");
