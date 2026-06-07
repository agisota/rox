import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ROX_DIR_NAME } from "shared/constants";

const ROX_HOME_DIR_ENV = "ROX_HOME_DIR";

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
