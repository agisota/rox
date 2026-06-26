/**
 * Shared appearance content + helpers (custom-loading-screens epic).
 *
 * Re-exports the curated quote/wallpaper packs, settings types, and the
 * no-repeat selection helpers used by every platform.
 */

export {
	APPEARANCE_STORAGE_KEY,
	BACKDROP_BLUR_PX,
	BACKDROP_BLUR_VAR,
	buildBfcacheResyncScript,
	buildFirstPaintScript,
	GLASS_ROOT_CLASS,
	SURFACE_OPACITY_VAR,
} from "./first-paint";
export { QUOTES } from "./quotes";
export type { Identifiable } from "./select";
export { pickNext, pickNextIndex } from "./select";
export {
	CHROME_COLOR_VAR_PRIORITY,
	type ChromeColorVar,
	resolveChromeColor,
} from "./theme-color";
export {
	type AppearanceSettings,
	clampWindowOpacity,
	DEFAULT_APPEARANCE_SETTINGS,
	MAX_WINDOW_OPACITY,
	MIN_WINDOW_OPACITY,
	type Quote,
	type Wallpaper,
	type WallpaperScene,
	type WallpaperSource,
} from "./types";
export { getWallpaper, WALLPAPERS } from "./wallpapers";
