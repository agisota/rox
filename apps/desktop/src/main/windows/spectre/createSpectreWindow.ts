import { join } from "node:path";
import { BrowserWindow } from "electron";
import { PLATFORM } from "shared/constants";
import { env } from "shared/env.shared";
import { buildSpectreWindowConfig } from "./spectreWindowConfig";

/** Construct the Spectre overlay window from the pure config factory. */
export function createSpectreWindow(): BrowserWindow {
	const preloadPath = join(__dirname, "../preload/index.js");
	return new BrowserWindow(
		buildSpectreWindowConfig({ isMac: PLATFORM.IS_MAC, preloadPath }),
	);
}

/**
 * Load the standalone `/spectre` hash-route into the overlay window. Mirrors the
 * dev/prod split in {@link registerRoute} (lib/window-loader) but targets the
 * `#/spectre` route instead of the dashboard `#/` so the overlay never mounts
 * the authenticated dashboard layout.
 */
export async function loadSpectre(win: BrowserWindow): Promise<void> {
	const isDev = env.NODE_ENV === "development";
	if (isDev) {
		await win.loadURL(`http://localhost:${env.DESKTOP_VITE_PORT}/#/spectre`);
	} else {
		await win.loadFile(join(__dirname, "../renderer/index.html"), {
			hash: "/spectre",
		});
	}
}
