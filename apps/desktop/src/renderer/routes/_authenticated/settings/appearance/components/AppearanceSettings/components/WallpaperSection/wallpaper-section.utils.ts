/**
 * Client-side helpers for the Wallpaper appearance section
 * (custom-loading-screens epic).
 *
 * The preview grid renders lightweight CSS swatches rather than running a WebGL
 * mesh-gradient per tile (there are several wallpapers), so this derives a plain
 * `linear-gradient` from a wallpaper's source. Image-backed wallpapers fall back
 * to a `cover` background image.
 */

import type { WallpaperSource } from "@rox/shared/appearance";

/** Default rotation interval (seconds) offered when none is persisted. */
export const DEFAULT_ROTATE_SECONDS = 120;
/** Inclusive bounds for the rotation-interval control (seconds). */
export const MIN_ROTATE_SECONDS = 30;
export const MAX_ROTATE_SECONDS = 600;

/**
 * A CSS `background` value previewing a wallpaper source. Gradient sources map
 * to a diagonal `linear-gradient`; image sources use a `cover` image url.
 */
export function previewBackground(source: WallpaperSource): string {
	switch (source.kind) {
		case "gradient":
			return `linear-gradient(135deg, ${source.colors.join(", ")})`;
		case "bundled":
			return `center / cover no-repeat url("${source.path}")`;
		case "remote":
			return `center / cover no-repeat url("${source.url}")`;
	}
}

/** Format a seconds interval as a short human label (e.g. "2 мин", "45 с"). */
export function formatRotateInterval(seconds: number): string {
	if (seconds % 60 === 0) return `${seconds / 60} мин`;
	if (seconds > 60) {
		const mins = Math.floor(seconds / 60);
		const rem = seconds % 60;
		return `${mins} мин ${rem} с`;
	}
	return `${seconds} с`;
}
