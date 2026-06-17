/**
 * Shared appearance content + helpers (custom-loading-screens epic).
 *
 * Re-exports the curated quote/wallpaper packs, settings types, and the
 * no-repeat selection helpers used by every platform.
 */

export { QUOTES } from "./quotes";
export type { Identifiable } from "./select";
export { pickNext, pickNextIndex } from "./select";
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
