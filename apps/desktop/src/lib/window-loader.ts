import type { BrowserWindow } from "electron";
import { env } from "shared/env.shared";
import { logger } from "shared/logger";

/** Window IDs defined in the router configuration */
type WindowId = "main" | "about";

/**
 * Load an Electron window with the appropriate URL for TanStack Router.
 * Uses hash-based routing for compatibility with Electron's file:// protocol.
 *
 * - Development: loads from Vite dev server at http://localhost:PORT/#/
 * - Production: loads from built HTML file with hash routing (#/)
 */
export function registerRoute(props: {
	id: WindowId;
	browserWindow: BrowserWindow;
	htmlFile: string;
	query?: Record<string, string>;
}): void {
	const isDev = env.NODE_ENV === "development";

	if (isDev) {
		// Development: load from Vite dev server with hash routing
		const url = `http://localhost:${env.DESKTOP_VITE_PORT}/#/`;
		logger.info("[window-loader] Loading development URL:", url);
		props.browserWindow.loadURL(url);
	} else {
		// Production: load from file with hash routing
		// TanStack Router uses hash-based routing, so we always start at #/
		logger.info("[window-loader] Loading file:", props.htmlFile);
		props.browserWindow.loadFile(props.htmlFile, { hash: "/" });
	}

	// Log successful loads
	props.browserWindow.webContents.on("did-finish-load", () => {
		logger.info(
			"[window-loader] Successfully loaded:",
			props.browserWindow.webContents.getURL(),
		);
	});

	// Log and handle load failures
	props.browserWindow.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription, validatedURL) => {
			logger.error("[window-loader] Failed to load URL:", validatedURL);
			logger.error("[window-loader] Error code:", errorCode);
			logger.error("[window-loader] Error description:", errorDescription);
		},
	);
}
