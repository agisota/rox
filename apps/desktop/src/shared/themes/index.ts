// Theme types

// Built-in themes
export {
	blackMetalDarkFuneralTheme,
	builtInThemes,
	DEFAULT_THEME_ID,
	darkTheme,
	getBuiltInTheme,
	lightTheme,
	monokaiTheme,
} from "./built-in";
export { getEditorTheme } from "./editor-theme";
export {
	normalizeThemeId,
	parseThemeConfigFile,
	RESERVED_THEME_IDS,
	type ThemeConfigParseResult,
} from "./import";
export type {
	EditorColors,
	EditorSyntaxColors,
	EditorTheme,
	TerminalColors,
	Theme,
	ThemeMetadata,
	UIColors,
} from "./types";
export {
	DEFAULT_TERMINAL_COLORS_DARK,
	DEFAULT_TERMINAL_COLORS_LIGHT,
	getDefaultTerminalColors,
	getTerminalColors,
} from "./types";
export { withAlpha } from "./utils";
// Lazy Zed-derived theme library (never eagerly spread into the store)
export {
	type Base16Scheme,
	type Base16System,
	base16ToZedFamily,
	base16ToZedStyle,
	convertZedFamily,
	convertZedTheme,
	getLibraryTheme,
	getLibraryThemeMetadata,
	getLibraryThemes,
	type ZedTheme,
	type ZedThemeFamily,
} from "./zed";
