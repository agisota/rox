/**
 * Bundled Zed-derived theme library.
 *
 * The dataset lives in `generated/zed-themes.json` (produced by
 * `scripts/convert-zed-themes.ts`). It is loaded lazily and memoized so the
 * (potentially large) array is never eagerly spread into the persisted theme
 * store — only the active library theme is cached there.
 */
import type { Theme, ThemeMetadata } from "../types";
import generatedThemes from "./generated/zed-themes.json";

export type { Base16Scheme, Base16System } from "./base16";
export { base16ToZedFamily, base16ToZedStyle } from "./base16";
export type { ZedTheme, ZedThemeFamily } from "./convert";
export { convertZedFamily, convertZedTheme } from "./convert";

let cachedThemes: Theme[] | null = null;
let cachedById: Map<string, Theme> | null = null;

function load(): Theme[] {
	if (cachedThemes) {
		return cachedThemes;
	}
	// The JSON is generated from the `Theme` shape; tag defensively so callers
	// can always rely on `isLibrary` even if the dataset omitted it.
	cachedThemes = (generatedThemes as Theme[]).map((theme) => ({
		...theme,
		isLibrary: true,
	}));
	cachedById = new Map(cachedThemes.map((theme) => [theme.id, theme]));
	return cachedThemes;
}

/** All bundled library themes (lazily loaded, memoized). */
export function getLibraryThemes(): Theme[] {
	return load();
}

/** Look up a single library theme by id, or `undefined` if not present. */
export function getLibraryTheme(id: string): Theme | undefined {
	load();
	return cachedById?.get(id);
}

/** Lightweight metadata list for the library (id/name/type), lazily loaded. */
export function getLibraryThemeMetadata(): ThemeMetadata[] {
	return load().map((theme) => ({
		id: theme.id,
		name: theme.name,
		author: theme.author,
		type: theme.type,
		isBuiltIn: false,
		isCustom: false,
		isLibrary: true,
	}));
}
