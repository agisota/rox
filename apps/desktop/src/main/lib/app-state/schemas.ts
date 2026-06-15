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
 * Glass / window-vibrancy appearance settings (themes-fonts epic).
 * Persisted in lowdb appState (NOT Postgres). macOS-only effects; the toggle
 * defaults on for the v2 desktop surface.
 */
export interface AppearanceState {
	/** Whether translucent glass surfaces + window vibrancy are enabled. */
	glassEnabled: boolean;
	/** Surface/window opacity, 0.2–1 (1 = fully opaque). */
	windowOpacity: number;
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
		activeThemeId: "dark",
		customThemes: [],
		systemLightThemeId: "light",
		systemDarkThemeId: "dark",
	},
	appearanceState: {
		glassEnabled: true,
		windowOpacity: 0.8,
	},
	hotkeysState: {
		version: 1,
		byPlatform: { darwin: {}, win32: {}, linux: {} },
	},
};
