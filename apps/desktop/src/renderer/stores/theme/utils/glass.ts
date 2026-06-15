/**
 * Glass / vibrancy helpers (themes-fonts epic).
 *
 * These drive the `--surface-opacity` / `--backdrop-blur` CSS variables and the
 * `.glass` document-root class that `globals.css` reacts to. They are kept
 * separate from {@link applyUIColors} so toggling glass never interferes with
 * the framer-motion color tween in `animateThemeChange` (which only touches the
 * color vars, not these).
 */

/** Default translucency applied when glass is enabled. */
export const DEFAULT_SURFACE_OPACITY = 0.3;
/** Default backdrop blur radius (px) applied when glass is enabled. */
export const DEFAULT_BACKDROP_BLUR_PX = 24;

export interface GlassSettings {
	/** Whether translucent glass surfaces are enabled. */
	enabled: boolean;
	/**
	 * Window/surface opacity in the 0–1 range. 1 = fully opaque. Lower values
	 * let more of the native vibrancy material show through.
	 */
	surfaceOpacity?: number;
	/** Backdrop blur radius in pixels. */
	backdropBlurPx?: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Apply glass settings to the document root: toggles the `.glass` class and
 * sets the opacity/blur CSS variables. Safe to call on every settings change.
 */
export function applyGlass(settings: GlassSettings): void {
	if (typeof document === "undefined") return;
	const root = document.documentElement;

	if (!settings.enabled) {
		root.classList.remove("glass");
		root.style.removeProperty("--surface-opacity");
		root.style.removeProperty("--backdrop-blur");
		return;
	}

	const opacity = clamp(
		settings.surfaceOpacity ?? DEFAULT_SURFACE_OPACITY,
		0.2,
		1,
	);
	const blur = clamp(
		settings.backdropBlurPx ?? DEFAULT_BACKDROP_BLUR_PX,
		0,
		64,
	);

	root.classList.add("glass");
	root.style.setProperty("--surface-opacity", String(opacity));
	root.style.setProperty("--backdrop-blur", `${blur}px`);
}
