import type { BrowserWindowConstructorOptions } from "electron";

export interface SpectreWindowConfigInput {
	isMac: boolean;
	preloadPath: string;
}

/**
 * Pure factory for the Spectre overlay BrowserWindow options. Side-effect-free so
 * the stealth/positioning invariants are unit-testable without spawning Electron.
 * Runtime-only behaviour (setContentProtection, alwaysOnTop level,
 * setVisibleOnAllWorkspaces) is applied in SpectreWindowManager after creation.
 *
 * Spectre is the Pluely-class overlay assistant: a compact, summon-by-hotkey,
 * always-on-top window that is hidden from screen-share/recording.
 */
export function buildSpectreWindowConfig(
	input: SpectreWindowConfigInput,
): BrowserWindowConstructorOptions {
	const { isMac, preloadPath } = input;
	return {
		width: 720,
		height: 88, // collapsed bar; renderer can request resize on expand
		show: false,
		frame: false,
		transparent: true,
		resizable: false,
		movable: true,
		minimizable: false,
		maximizable: false,
		skipTaskbar: true,
		alwaysOnTop: true,
		hasShadow: false,
		backgroundColor: "#00000000",
		// macOS "panel" lets the overlay float above fullscreen apps without
		// activating / stealing the Space focus. Omitted off-mac.
		...(isMac ? { type: "panel" as const } : {}),
		webPreferences: {
			preload: preloadPath,
			partition: "persist:rox",
		},
	};
}
