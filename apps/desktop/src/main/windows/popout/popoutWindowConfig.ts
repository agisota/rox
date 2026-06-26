import type { BrowserWindowConstructorOptions } from "electron";
import type { GlassWindowOptions } from "main/lib/glass-window";
import type { InitialWindowBounds } from "main/lib/window-state";

export interface PopoutWindowConfigInput {
	preloadPath: string;
	/** Computed bounds (restored per-popout or centered default). */
	bounds: InitialWindowBounds;
	/** Vibrancy/opaque options from {@link getGlassWindowOptions}. */
	glassOptions: GlassWindowOptions;
	title: string;
}

/**
 * Pure factory for a tear-off popout BrowserWindow's options (F52).
 *
 * Side-effect-free so the chrome invariants (frameless glass, hidden custom
 * titlebar, traffic-light inset) are unit-testable without spawning Electron —
 * mirroring {@link buildSpectreWindowConfig}. A popout is a normal, resizable,
 * non-always-on-top window (unlike Spectre's floating overlay); it shares the
 * main window's frameless glass chrome so the custom titlebar renders the same.
 */
export function buildPopoutWindowConfig(
	input: PopoutWindowConfigInput,
): BrowserWindowConstructorOptions {
	const { preloadPath, bounds, glassOptions, title } = input;
	return {
		title,
		width: bounds.width,
		height: bounds.height,
		x: bounds.x,
		y: bounds.y,
		center: bounds.center,
		minWidth: 360,
		minHeight: 320,
		show: false,
		movable: true,
		resizable: true,
		alwaysOnTop: false,
		autoHideMenuBar: true,
		// Frameless glass chrome + custom titlebar, matching the main window so the
		// torn-off pane keeps the same window affordances.
		frame: false,
		titleBarStyle: "hidden",
		trafficLightPosition: { x: 16, y: 16 },
		...glassOptions,
		webPreferences: {
			preload: preloadPath,
			webviewTag: true,
			// Same isolated session as the main window so popouts share bearer-token
			// auth and cookies (single core-state).
			partition: "persist:rox",
		},
	};
}
