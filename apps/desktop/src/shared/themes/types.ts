/**
 * Theme type definitions for the Rox desktop app
 *
 * Themes control UI colors, terminal colors, and editor/diff colors.
 */

// The UI-color axis is the shared cross-platform skin model (F08), lifted to
// `@rox/ui/theme`. Imported for use in `Theme` below and re-exported so the
// desktop `shared/themes` import surface stays stable.
import type { UIColors } from "@rox/ui/theme";

export type { UIColors };

/**
 * Default xterm.js terminal colors for dark mode
 */
export const DEFAULT_TERMINAL_COLORS_DARK: TerminalColors = {
	background: "#000000",
	foreground: "#ffffff",
	cursor: "#ffffff",
	cursorAccent: "#000000",
	selectionBackground: "#4d4d4d",

	// Standard ANSI colors (xterm defaults)
	black: "#2e3436",
	red: "#cc0000",
	green: "#4e9a06",
	yellow: "#c4a000",
	blue: "#3465a4",
	magenta: "#75507b",
	cyan: "#06989a",
	white: "#d3d7cf",

	// Bright ANSI colors (xterm defaults)
	brightBlack: "#555753",
	brightRed: "#ef2929",
	brightGreen: "#8ae234",
	brightYellow: "#fce94f",
	brightBlue: "#729fcf",
	brightMagenta: "#ad7fa8",
	brightCyan: "#34e2e2",
	brightWhite: "#eeeeec",
};

/**
 * Default xterm.js terminal colors for light mode
 */
export const DEFAULT_TERMINAL_COLORS_LIGHT: TerminalColors = {
	background: "#ffffff",
	foreground: "#000000",
	cursor: "#000000",
	cursorAccent: "#ffffff",
	selectionBackground: "#add6ff",

	// Standard ANSI colors (xterm defaults)
	black: "#2e3436",
	red: "#cc0000",
	green: "#4e9a06",
	yellow: "#c4a000",
	blue: "#3465a4",
	magenta: "#75507b",
	cyan: "#06989a",
	white: "#d3d7cf",

	// Bright ANSI colors (xterm defaults)
	brightBlack: "#555753",
	brightRed: "#ef2929",
	brightGreen: "#8ae234",
	brightYellow: "#fce94f",
	brightBlue: "#729fcf",
	brightMagenta: "#ad7fa8",
	brightCyan: "#34e2e2",
	brightWhite: "#eeeeec",
};

/**
 * Get default terminal colors based on theme type
 */
export function getDefaultTerminalColors(
	type: "dark" | "light",
): TerminalColors {
	return type === "dark"
		? DEFAULT_TERMINAL_COLORS_DARK
		: DEFAULT_TERMINAL_COLORS_LIGHT;
}

/**
 * Get terminal colors from a theme, falling back to defaults if not defined
 */
export function getTerminalColors(theme: Theme): TerminalColors {
	return theme.terminal ?? getDefaultTerminalColors(theme.type);
}

/**
 * Terminal ANSI color palette
 * Standard 16-color ANSI palette plus background/foreground/cursor
 */
export interface TerminalColors {
	// Background and foreground
	background: string;
	foreground: string;
	cursor: string;
	cursorAccent?: string;
	selectionBackground?: string;
	selectionForeground?: string;

	// Standard ANSI colors (0-7)
	black: string;
	red: string;
	green: string;
	yellow: string;
	blue: string;
	magenta: string;
	cyan: string;
	white: string;

	// Bright ANSI colors (8-15)
	brightBlack: string;
	brightRed: string;
	brightGreen: string;
	brightYellow: string;
	brightBlue: string;
	brightMagenta: string;
	brightCyan: string;
	brightWhite: string;
}

/**
 * Editor chrome colors shared by raw editing and diff rendering
 */
export interface EditorColors {
	background: string;
	foreground: string;
	border: string;
	cursor: string;
	gutterBackground: string;
	gutterForeground: string;
	activeLine: string;
	selection: string;
	search: string;
	searchActive: string;
	panel: string;
	panelBorder: string;
	panelInputBackground: string;
	panelInputForeground: string;
	panelInputBorder: string;
	panelButtonBackground: string;
	panelButtonForeground: string;
	panelButtonBorder: string;
	diffBuffer: string;
	diffHover: string;
	diffSeparator: string;
	addition: string;
	deletion: string;
	modified: string;
}

/**
 * Syntax colors shared by CodeMirror and Shiki/Pierre
 */
export interface EditorSyntaxColors {
	plainText: string;
	comment: string;
	keyword: string;
	string: string;
	number: string;
	functionCall: string;
	variableName: string;
	typeName: string;
	className: string;
	constant: string;
	regexp: string;
	tagName: string;
	attributeName: string;
	invalid: string;
}

/**
 * Complete editor theme definition
 */
export interface EditorTheme {
	colors: EditorColors;
	syntax: EditorSyntaxColors;
}

/**
 * Partial editor overrides used by built-in and imported themes.
 */
export interface EditorThemeOverrides {
	colors?: Partial<EditorColors>;
	syntax?: Partial<EditorSyntaxColors>;
}

/**
 * Complete theme definition
 */
export interface Theme {
	/** Unique identifier (slug) */
	id: string;
	/** Display name */
	name: string;
	/** Theme author */
	author?: string;
	/** Theme version */
	version?: string;
	/** Theme description */
	description?: string;
	/** Theme type for system preference matching */
	type: "dark" | "light";

	/** UI colors for app chrome */
	ui: UIColors;
	/** Terminal ANSI colors (optional, falls back to xterm defaults based on theme type) */
	terminal?: TerminalColors;
	/** Code editor and diff colors (optional, otherwise derived from UI + terminal tokens) */
	editor?: EditorThemeOverrides;

	/** Whether this is a built-in theme */
	isBuiltIn?: boolean;
	/** Whether this is a user-imported custom theme */
	isCustom?: boolean;
	/**
	 * Whether this theme comes from the bundled Zed-derived library dataset.
	 * Library themes are lazily loaded and are NOT eagerly spread into the
	 * persisted store — only the active library theme is cached.
	 */
	isLibrary?: boolean;
}

/**
 * Theme metadata for lists (without full color data)
 */
export interface ThemeMetadata {
	id: string;
	name: string;
	author?: string;
	type: "dark" | "light";
	isBuiltIn: boolean;
	isCustom: boolean;
	isLibrary?: boolean;
}
