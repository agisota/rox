import { animateThemeChange } from "../motion";
import {
	clearThemeVariables,
	UI_COLOR_TO_CSS_VAR,
	type UIColors,
} from "./colors";
import { DEFAULT_SKIN_ID, getSkin, type Skin } from "./skins";

/**
 * Apply a skin's CSS-var overrides to the document root, writing `data-skin`
 * and crossfading from the previously-applied overrides.
 *
 * The crossfade reuses {@link animateThemeChange} (the same imperative tween the
 * desktop theme store uses), which is reduced-motion aware: under
 * `prefers-reduced-motion` / motion-off, or on first paint (`prevSkin === null`)
 * it hard-sets the next colors with no flash. Keys a skin omits are cleared so
 * they fall back to the globals.css default for the active theme — the skin axis
 * never pins a token the skin didn't intend to own.
 */
export function applySkin(prevSkin: Skin | null, nextSkin: Skin): void {
	const root = document.documentElement;
	root.setAttribute("data-skin", nextSkin.id);

	// Clear any vars the previous skin set that the next one does not, so they
	// revert to the stylesheet default instead of sticking around.
	if (prevSkin) {
		for (const key of Object.keys(prevSkin.ui) as Array<keyof UIColors>) {
			if (!(key in nextSkin.ui)) {
				const cssVar = UI_COLOR_TO_CSS_VAR[key];
				if (cssVar) root.style.removeProperty(cssVar);
			}
		}
	}

	// `animateThemeChange` only writes keys present on `nextColors`, so passing
	// the partial skin override is safe — unset tokens are left to globals.css.
	animateThemeChange(
		(prevSkin?.ui ?? null) as UIColors | null,
		nextSkin.ui as UIColors,
		{ colorToCssVar: UI_COLOR_TO_CSS_VAR, applyColors: (c) => applyPartial(c) },
	);
}

/** Hard-set only the keys present on a partial skin palette. */
function applyPartial(colors: Partial<UIColors>): void {
	const root = document.documentElement;
	for (const [key, cssVar] of Object.entries(UI_COLOR_TO_CSS_VAR)) {
		const value = colors[key as keyof UIColors];
		if (value) root.style.setProperty(cssVar, value);
	}
}

/** Reset to the default skin (clears every skin override). */
export function clearSkin(): void {
	clearThemeVariables();
	document.documentElement.setAttribute("data-skin", DEFAULT_SKIN_ID);
}

/** Resolve a skin id and apply it (convenience for restore-on-mount paths). */
export function applySkinById(id: string, prevSkin: Skin | null = null): Skin {
	const skin = getSkin(id);
	applySkin(prevSkin, skin);
	return skin;
}
