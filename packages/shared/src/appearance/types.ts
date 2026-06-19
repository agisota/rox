/**
 * Appearance content + settings types (custom-loading-screens epic).
 *
 * Platform-agnostic shapes shared by desktop, web, and mobile. The persisted
 * settings extend the desktop `appState.appearanceState` (which already carries
 * `glassEnabled` / `windowOpacity`) so the same object can drive every platform.
 * See `plans/2026-06-16-custom-loading-screens-and-glass.md`.
 */

/**
 * Where a wallpaper image is loaded from. Designed up front so a bundled pack
 * can later be swapped for lazily-downloaded assets (preinstall-catalog style)
 * without changing consumers. The `gradient` kind ships zero-asset backgrounds
 * (animated mesh gradients) that work offline as a lightweight fallback.
 */
export type WallpaperSource =
	| { kind: "bundled"; path: string }
	| { kind: "remote"; url: string }
	| { kind: "gradient"; colors: readonly [string, string, string, string] };

/**
 * Atmosphere applied on top of a `gradient` source to make it read as a
 * cinematic scene rather than a flat mesh. Renderers layer scene-specific light
 * (aurora bands, nebula glow, drifting dunes, a low horizon, or a calm haze)
 * plus shared film grain + vignette over the base gradient. Zero-asset, so
 * cinematic wallpapers stay offline and add no installer weight. Defaults to
 * `"calm"` when a gradient wallpaper omits a scene.
 */
export type WallpaperScene = "aurora" | "nebula" | "dunes" | "horizon" | "calm";

/** A single background image in the curated wallpaper pack. */
export interface Wallpaper {
	id: string;
	name: string;
	/** Full-resolution image source. */
	source: WallpaperSource;
	/** Optional smaller source for settings preview grids. */
	thumb?: WallpaperSource;
	/** Dominant tone — used to pick legible foreground/quote colors. */
	tone: "dark" | "light";
	/**
	 * Cinematic atmosphere for `gradient` sources. Ignored for image sources
	 * (`bundled` / `remote`), which already carry their own scene.
	 */
	scene?: WallpaperScene;
	/** Optional attribution shown in settings. */
	credit?: string;
}

/** A motivational quote shown on the loading / focus screen. */
export interface Quote {
	id: string;
	text: string;
	/** Optional attribution. Omitted for anonymous/proverbial lines. */
	author?: string;
	/**
	 * Optional substring of `text` to visually emphasize (italic/accent). Must
	 * appear verbatim in `text`; consumers fall back to no emphasis otherwise.
	 */
	emphasis?: string;
}

/**
 * Persisted appearance preferences. A superset of the desktop glass settings so
 * existing `appState.appearanceState` rows migrate forward by gaining defaults.
 */
export interface AppearanceSettings {
	/** Whether translucent glass surfaces are enabled. */
	glassEnabled: boolean;
	/** Surface opacity in 0.2–1 when glass is enabled (1 = opaque). */
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

/** Default appearance — soft light look: 60% opacity, dawn-mist, no auto-rotate. */
export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
	glassEnabled: false,
	windowOpacity: 0.6,
	wallpaperId: "dawn-mist",
	wallpaperAutoRotate: false,
	wallpaperRotateSeconds: 120,
	quoteLoaderEnabled: true,
};

/** Inclusive bounds for {@link AppearanceSettings.windowOpacity}. */
export const MIN_WINDOW_OPACITY = 0.2;
export const MAX_WINDOW_OPACITY = 1;

/**
 * Clamp a window-opacity value into the valid 0.2–1 range. `windowOpacity` is a
 * plain `number` (settings are persisted as JSON), so callers normalize at the
 * boundary rather than relying on a branded type. NaN falls back to the default.
 */
export function clampWindowOpacity(value: number): number {
	if (Number.isNaN(value)) return DEFAULT_APPEARANCE_SETTINGS.windowOpacity;
	return Math.min(MAX_WINDOW_OPACITY, Math.max(MIN_WINDOW_OPACITY, value));
}
