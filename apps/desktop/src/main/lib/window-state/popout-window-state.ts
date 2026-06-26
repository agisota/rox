import {
	existsSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { logger } from "main/lib/logger";
import { POPOUT_WINDOW_STATE_PATH } from "../app-environment";
import { isValidWindowState, type WindowState } from "./window-state";

/**
 * Per-popout window geometry (F52 — desktop multi-window / tear-off).
 *
 * The main window persists a single {@link WindowState} to `window-state.json`.
 * Tear-off popout windows instead share one `popout-windows.json` file keyed by
 * a stable popout id (e.g. `workspaceId:paneId`), so each detached pane window
 * restores its own bounds independently and closing one popout never corrupts
 * the others — or the main window's state.
 */
export type PopoutWindowStateMap = Record<string, WindowState>;

function isValidMap(value: unknown): value is PopoutWindowStateMap {
	if (!value || typeof value !== "object") return false;
	return Object.values(value as Record<string, unknown>).every((entry) =>
		isValidWindowState(entry),
	);
}

/**
 * Load the full popout-window-state map from disk. Returns an empty map when the
 * file is missing, unreadable, or has an invalid shape (treated as no state, so
 * a corrupt file degrades to "open centered" rather than throwing).
 */
export function loadPopoutWindowStates(
	filePath: string = POPOUT_WINDOW_STATE_PATH,
): PopoutWindowStateMap {
	try {
		if (!existsSync(filePath)) return {};
		const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
		if (!isValidMap(parsed)) return {};
		return parsed;
	} catch {
		return {};
	}
}

/** Load a single popout window's saved bounds, or null when not yet persisted. */
export function loadPopoutWindowState(
	popoutId: string,
	filePath: string = POPOUT_WINDOW_STATE_PATH,
): WindowState | null {
	return loadPopoutWindowStates(filePath)[popoutId] ?? null;
}

/**
 * Persist (or clear) a single popout's bounds atomically (temp file + rename),
 * merging into the existing map so concurrent popouts don't clobber each other.
 * Passing `null` removes the entry — used when a popout closes and we no longer
 * want to resurrect stale geometry. A partial write can never corrupt the file.
 *
 * `filePath` is injectable for tests; production callers use the default path.
 */
export function savePopoutWindowState(
	popoutId: string,
	state: WindowState | null,
	filePath: string = POPOUT_WINDOW_STATE_PATH,
): void {
	const map = loadPopoutWindowStates(filePath);
	if (state === null) {
		if (!(popoutId in map)) return;
		delete map[popoutId];
	} else {
		map[popoutId] = state;
	}

	const tempPath = join(dirname(filePath), `.popout-windows.${Date.now()}.tmp`);
	try {
		writeFileSync(tempPath, JSON.stringify(map, null, 2), "utf-8");
		renameSync(tempPath, filePath); // Atomic replace
	} catch (error) {
		try {
			unlinkSync(tempPath);
		} catch {}
		logger.error("[popout-window-state] Failed to save:", error);
	}
}
