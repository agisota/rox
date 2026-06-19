/**
 * UI state schemas (persisted from renderer zustand stores)
 */
import type { BaseTabsState } from "shared/tabs-types";
import type { Theme } from "shared/themes";

// Re-export for convenience
export type { BaseTabsState as TabsState, Pane } from "shared/tabs-types";

export interface ThemeState {
	activeThemeId: string;
	customThemes: Theme[];
	systemLightThemeId?: string;
	systemDarkThemeId?: string;
}

/**
 * Appearance settings (themes-fonts + custom-loading-screens epics).
 * Persisted in lowdb appState (NOT Postgres). Glass/vibrancy effects are
 * macOS-only; the toggle defaults on for the v2 desktop surface. The wallpaper
 * + quote-loader fields extend the original `{ glassEnabled, windowOpacity }`
 * shape — existing persisted rows gain the new fields via `ensureValidShape`.
 *
 * The shape mirrors `AppearanceSettings` from `@rox/shared/appearance` so the
 * same persisted object can drive every platform.
 */
export interface AppearanceState {
	/** Whether translucent glass surfaces + window vibrancy are enabled. */
	glassEnabled: boolean;
	/** Surface/window opacity, 0.2–1 (1 = fully opaque). */
	windowOpacity: number;
	/** Active wallpaper id, or null for no wallpaper background. */
	wallpaperId: string | null;
	/** Whether the wallpaper auto-rotates on a timer. */
	wallpaperAutoRotate: boolean;
	/** Rotation interval in seconds when auto-rotate is on. */
	wallpaperRotateSeconds: number;
	/** Whether the motivational quote loading screen is shown. */
	quoteLoaderEnabled: boolean;
}

/** Legacy hotkeys state shape (kept for reading old app-state.json during migration) */
interface LegacyHotkeysState {
	version: number;
	byPlatform: Record<string, Record<string, string | null>>;
}

export interface AppState {
	tabsState: BaseTabsState;
	themeState: ThemeState;
	appearanceState: AppearanceState;
	hotkeysState: LegacyHotkeysState;
}

export const defaultAppState: AppState = {
	tabsState: {
		tabs: [],
		panes: {},
		activeTabIds: {},
		focusedPaneIds: {},
		tabHistoryStacks: {},
	},
	themeState: {
		// Default to the light "classic" theme with the dawn-mist wallpaper and
		// 60% window opacity (glass on) for a soft, bright first-run look.
		activeThemeId: "light",
		customThemes: [],
		systemLightThemeId: "light",
		systemDarkThemeId: "dark",
	},
	appearanceState: {
		glassEnabled: true,
		windowOpacity: 0.6,
		wallpaperId: "dawn-mist",
		wallpaperAutoRotate: false,
		wallpaperRotateSeconds: 120,
		quoteLoaderEnabled: true,
	},
	hotkeysState: {
		version: 1,
		byPlatform: { darwin: {}, win32: {}, linux: {} },
	},
};
