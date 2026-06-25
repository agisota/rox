/**
 * Glass / vibrancy window helpers (themes-fonts epic).
 *
 * Translucent "glass" windows are a macOS-only effect built on Electron's
 * `vibrancy` / `visualEffectState` / `transparent` BrowserWindow options. These
 * helpers centralize the gating (mac-only + user toggle) so both the initial
 * `createWindow` call and live IPC updates stay consistent. On non-mac, or when
 * the toggle is off, callers fall back to an opaque `backgroundColor`.
 *
 * Window-chrome theme (F09): the window is `frame:false` / `titleBarStyle:
 * "hidden"`, so the titlebar is the renderer-drawn `TopBar` styled entirely with
 * theme tokens (`bg-muted`, `border-border`, …). Those tokens resolve from the
 * same `--background` / workspace-accent CSS vars the web meta theme-color reads,
 * so the desktop titlebar/glass accent tracks theme + skin + workspace accent in
 * lock-step with zero IPC — no native chrome color to sync here. The
 * `fallbackBackgroundColor` below is theme-aware (via `nativeTheme`) and only
 * paints the brief pre-render / non-glass surface before the renderer takes over.
 */
import type { BrowserWindow } from "electron";
import { PLATFORM } from "shared/constants";

export interface GlassWindowSettings {
	glassEnabled: boolean;
	/** Surface/window opacity, 0.2–1. Currently informational for the renderer. */
	windowOpacity: number;
}

/** BrowserWindow option subset used to express vibrancy. */
export interface GlassWindowOptions {
	transparent?: boolean;
	vibrancy?: "under-window" | "fullscreen-ui" | "sidebar";
	visualEffectState?: "active" | "inactive" | "followWindow";
	backgroundColor?: string;
}

/**
 * Compute the BrowserWindow vibrancy options for the given settings.
 * Returns transparent/vibrancy options when glass is enabled on macOS;
 * otherwise returns the opaque `backgroundColor` fallback.
 */
export function getGlassWindowOptions(
	settings: GlassWindowSettings,
	fallbackBackgroundColor: string,
): GlassWindowOptions {
	if (!PLATFORM.IS_MAC || !settings.glassEnabled) {
		return { backgroundColor: fallbackBackgroundColor };
	}
	return {
		transparent: true,
		vibrancy: "under-window",
		visualEffectState: "active",
		// Keep a backgroundColor so any non-vibrant region degrades gracefully.
		backgroundColor: "#00000000",
	};
}

/**
 * Apply (or clear) window vibrancy at runtime for a live settings change.
 * No-op on non-mac. Electron exposes `setVibrancy(null)` to disable.
 */
export function applyGlassToWindow(
	window: BrowserWindow,
	settings: GlassWindowSettings,
	fallbackBackgroundColor: string,
): void {
	if (!PLATFORM.IS_MAC || window.isDestroyed()) return;

	if (settings.glassEnabled) {
		window.setVibrancy("under-window");
		window.setBackgroundColor("#00000000");
	} else {
		window.setVibrancy(null);
		window.setBackgroundColor(fallbackBackgroundColor);
	}
}
