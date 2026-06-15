import type { Theme } from "../types";
import generatedThemes from "../zed/generated/zed-themes.json";
import { darkTheme } from "./ember";
import { lightTheme } from "./light";
import { monokaiTheme } from "./monokai";

const libraryDefaultTheme = (generatedThemes as Theme[]).find(
	(theme) => theme.id === "black-metal-dark-funeral",
);

export const blackMetalDarkFuneralTheme: Theme = libraryDefaultTheme
	? {
			...libraryDefaultTheme,
			isBuiltIn: true,
			isLibrary: true,
		}
	: darkTheme;
/**
 * All built-in themes
 */
export const builtInThemes: Theme[] = [
	blackMetalDarkFuneralTheme,
	darkTheme,
	lightTheme,
	monokaiTheme,
];

/**
 * Default theme ID
 */
export const DEFAULT_THEME_ID = "black-metal-dark-funeral";

/**
 * Get a built-in theme by ID
 */
export function getBuiltInTheme(id: string): Theme | undefined {
	return builtInThemes.find((theme) => theme.id === id);
}

// Re-export individual themes
export { darkTheme, lightTheme, monokaiTheme };
