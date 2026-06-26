import { join } from "node:path";
import { BrowserWindow, nativeTheme } from "electron";
import { appState } from "main/lib/app-state";
import { getGlassWindowOptions } from "main/lib/glass-window";
import {
	getInitialWindowBounds,
	loadPopoutWindowState,
} from "main/lib/window-state";
import { env } from "shared/env.shared";
import {
	POPOUT_QUERY_KEYS,
	type PopoutWindowPayload,
} from "shared/types/popout";
import { buildPopoutWindowConfig } from "./popoutWindowConfig";

function popoutTitle(payload: PopoutWindowPayload): string {
	const label =
		payload.kind === "file-tree"
			? "Files"
			: payload.kind === "chat"
				? "Chat"
				: "Terminal";
	return `Rox — ${label}`;
}

/**
 * Construct a tear-off popout BrowserWindow for the given payload (F52).
 *
 * Resolves per-popout persisted bounds (keyed by workspace+pane) and the live
 * glass settings, then builds the frameless glass window from the pure config
 * factory. The window is created hidden; the caller shows it after the renderer
 * finishes its first load (avoids a white flash), exactly like the main window.
 */
export function createPopoutWindow(
	payload: PopoutWindowPayload,
): BrowserWindow {
	const preloadPath = join(__dirname, "../preload/index.js");

	const saved = loadPopoutWindowState(
		`popout:${payload.workspaceId}:${payload.paneId}`,
	);
	const bounds = getInitialWindowBounds(saved);

	const fallbackBackgroundColor = nativeTheme.shouldUseDarkColors
		? "#252525"
		: "#ffffff";
	const glassOptions = getGlassWindowOptions(
		appState.data.appearanceState,
		fallbackBackgroundColor,
	);

	return new BrowserWindow(
		buildPopoutWindowConfig({
			preloadPath,
			bounds,
			glassOptions,
			title: popoutTitle(payload),
		}),
	);
}

/**
 * Build the `#/popout` hash-route URL (or file + hash) carrying the serialized
 * pane payload as query params. Mirrors the dev/prod split in
 * {@link loadSpectre} but targets the popout route so the new window mounts a
 * single-pane view rehydrated from `paneLayout` instead of the full dashboard.
 *
 * Exposed (not just the loader) so it is unit-testable without Electron.
 */
export function buildPopoutHash(payload: PopoutWindowPayload): string {
	const params = new URLSearchParams({
		[POPOUT_QUERY_KEYS.workspaceId]: payload.workspaceId,
		[POPOUT_QUERY_KEYS.paneId]: payload.paneId,
		[POPOUT_QUERY_KEYS.kind]: payload.kind,
		[POPOUT_QUERY_KEYS.paneLayout]: payload.paneLayoutJson,
	});
	return `/popout?${params.toString()}`;
}

/** Load the standalone `/popout` route into the popout window. */
export async function loadPopout(
	win: BrowserWindow,
	payload: PopoutWindowPayload,
): Promise<void> {
	const hash = buildPopoutHash(payload);
	const isDev = env.NODE_ENV === "development";
	if (isDev) {
		await win.loadURL(`http://localhost:${env.DESKTOP_VITE_PORT}/#${hash}`);
	} else {
		await win.loadFile(join(__dirname, "../renderer/index.html"), { hash });
	}
}
