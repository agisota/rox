/**
 * Glass DOM helper for web (custom-loading-screens epic).
 *
 * Mirrors the desktop `applyGlass` conceptually: it drives the shared
 * `--surface-opacity` / `--backdrop-blur` CSS variables and the `.glass`
 * document-root class that `@rox/ui/globals.css` reacts to. No new CSS is
 * needed on web — toggling these is enough to enable the glass look.
 */

import {
	type AppearanceSettings,
	BACKDROP_BLUR_PX,
	BACKDROP_BLUR_VAR,
	clampWindowOpacity,
	GLASS_ROOT_CLASS,
	SURFACE_OPACITY_VAR,
} from "@rox/shared/appearance";

/**
 * Apply glass settings to the document root: toggles the `.glass` class and
 * sets the opacity/blur CSS variables when enabled, removing them otherwise.
 * SSR-safe (no-op without a `document`) and safe to call on every change.
 *
 * Reads the same root class + CSS variable + blur contract as the F06
 * pre-hydration first-paint script (`@rox/shared/appearance` `first-paint`), so
 * the synchronous stamp and this runtime reader can never drift.
 */
export function applyGlass(settings: AppearanceSettings): void {
	if (typeof document === "undefined") return;
	const root = document.documentElement;

	if (!settings.glassEnabled) {
		root.classList.remove(GLASS_ROOT_CLASS);
		root.style.removeProperty(SURFACE_OPACITY_VAR);
		root.style.removeProperty(BACKDROP_BLUR_VAR);
		return;
	}

	root.classList.add(GLASS_ROOT_CLASS);
	root.style.setProperty(
		SURFACE_OPACITY_VAR,
		String(clampWindowOpacity(settings.windowOpacity)),
	);
	root.style.setProperty(BACKDROP_BLUR_VAR, `${BACKDROP_BLUR_PX}px`);
}
