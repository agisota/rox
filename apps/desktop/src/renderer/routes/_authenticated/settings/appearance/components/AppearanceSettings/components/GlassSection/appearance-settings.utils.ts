/**
 * Client-side helpers for the Appearance glass settings (themes-fonts epic).
 *
 * The persisted source of truth lives in lowdb appState (via the
 * `window.getAppearance` / `window.setGlass` tRPC procedures). These helpers
 * translate that persisted shape into the renderer-side glass application
 * (CSS variables + `.glass` root class) and format values for the UI.
 */
import {
	applyGlass,
	type GlassSettings,
} from "renderer/stores/theme/utils/glass";

export interface AppearanceGlassState {
	glassEnabled: boolean;
	windowOpacity: number;
}

export const MIN_WINDOW_OPACITY = 0.2;
export const MAX_WINDOW_OPACITY = 1;
export const DEFAULT_GLASS_WINDOW_OPACITY = 0.8;

/** Convert persisted appearance state into renderer glass settings. */
export function toGlassSettings(state: AppearanceGlassState): GlassSettings {
	return {
		enabled: state.glassEnabled,
		surfaceOpacity: state.windowOpacity,
	};
}

/** Apply persisted appearance state to the document (CSS vars + `.glass`). */
export function applyAppearanceGlass(state: AppearanceGlassState): void {
	applyGlass(toGlassSettings(state));
}

/** Format a 0–1 opacity as a whole-number percentage label. */
export function formatOpacityPercent(opacity: number): string {
	return `${Math.round(opacity * 100)}%`;
}
