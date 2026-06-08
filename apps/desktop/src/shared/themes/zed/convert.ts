/**
 * Zed → Rox theme converter.
 *
 * Maps a Zed theme family JSON (the format published at
 * github.com/zed-industries/zed `assets/themes/*.json`) into Rox {@link Theme}
 * objects. Reuses the existing terminal/editor derivation helpers so library
 * themes look consistent with built-in and imported themes.
 *
 * The converter is pure and deterministic: it never touches the persisted store
 * and never collides with {@link RESERVED_THEME_IDS}. Output themes are flagged
 * with `isLibrary: true`.
 */
import { getEditorTheme } from "../editor-theme";
import { normalizeThemeId, RESERVED_THEME_IDS } from "../import";
import {
	getDefaultTerminalColors,
	type TerminalColors,
	type Theme,
	type UIColors,
} from "../types";
import { toHexAuto } from "../utils";

/** A single theme variant inside a Zed theme family. */
export interface ZedTheme {
	name: string;
	appearance: "dark" | "light";
	style: Record<string, unknown>;
}

/** A Zed theme family file (`{ name, author, themes: [...] }`). */
export interface ZedThemeFamily {
	name?: string;
	author?: string;
	themes: ZedTheme[];
}

/**
 * Pull a color string out of the Zed `style` map, trying each key in order.
 * Returns `undefined` when none resolve to a usable color string.
 */
function pick(
	style: Record<string, unknown>,
	keys: string[],
): string | undefined {
	for (const key of keys) {
		const value = style[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value;
		}
	}
	return undefined;
}

/** Resolve a color from the style map, falling back to `fallback`. */
function color(
	style: Record<string, unknown>,
	keys: string[],
	fallback: string,
): string {
	const raw = pick(style, keys);
	return raw ? toHexAuto(raw) : fallback;
}

function buildTerminalColors(
	style: Record<string, unknown>,
	appearance: "dark" | "light",
): TerminalColors {
	const defaults = getDefaultTerminalColors(appearance);
	return {
		background: color(
			style,
			["terminal.background", "background"],
			defaults.background,
		),
		foreground: color(
			style,
			["terminal.foreground", "text"],
			defaults.foreground,
		),
		cursor: color(
			style,
			["terminal.cursor", "editor.foreground", "text"],
			defaults.cursor,
		),
		cursorAccent: color(
			style,
			["terminal.background", "background"],
			defaults.cursorAccent ?? defaults.background,
		),
		selectionBackground: color(
			style,
			["terminal.selection.background", "element.selection.background"],
			defaults.selectionBackground ?? defaults.background,
		),
		black: color(style, ["terminal.ansi.black"], defaults.black),
		red: color(style, ["terminal.ansi.red"], defaults.red),
		green: color(style, ["terminal.ansi.green"], defaults.green),
		yellow: color(style, ["terminal.ansi.yellow"], defaults.yellow),
		blue: color(style, ["terminal.ansi.blue"], defaults.blue),
		magenta: color(style, ["terminal.ansi.magenta"], defaults.magenta),
		cyan: color(style, ["terminal.ansi.cyan"], defaults.cyan),
		white: color(style, ["terminal.ansi.white"], defaults.white),
		brightBlack: color(
			style,
			["terminal.ansi.bright_black"],
			defaults.brightBlack,
		),
		brightRed: color(style, ["terminal.ansi.bright_red"], defaults.brightRed),
		brightGreen: color(
			style,
			["terminal.ansi.bright_green"],
			defaults.brightGreen,
		),
		brightYellow: color(
			style,
			["terminal.ansi.bright_yellow"],
			defaults.brightYellow,
		),
		brightBlue: color(
			style,
			["terminal.ansi.bright_blue"],
			defaults.brightBlue,
		),
		brightMagenta: color(
			style,
			["terminal.ansi.bright_magenta"],
			defaults.brightMagenta,
		),
		brightCyan: color(
			style,
			["terminal.ansi.bright_cyan"],
			defaults.brightCyan,
		),
		brightWhite: color(
			style,
			["terminal.ansi.bright_white"],
			defaults.brightWhite,
		),
	};
}

function buildUIColors(
	style: Record<string, unknown>,
	appearance: "dark" | "light",
): UIColors {
	const background = color(style, ["background"], "#1e1e1e");
	const foreground = color(style, ["text", "editor.foreground"], "#e0e0e0");
	const muted = color(style, ["text.muted", "text.disabled"], foreground);
	const surface = color(
		style,
		["surface.background", "background"],
		background,
	);
	const elevated = color(
		style,
		["elevated_surface.background", "surface.background", "background"],
		surface,
	);
	const accent = color(
		style,
		["element.selected", "element.hover", "element.background"],
		surface,
	);
	const border = color(style, ["border", "border.variant"], surface);
	const primary = color(
		style,
		["text.accent", "element.active", "editor.foreground", "text"],
		foreground,
	);
	const destructive = color(
		style,
		["error", "text.error", "terminal.ansi.red"],
		"#cc4444",
	);

	return {
		background,
		foreground,
		card: elevated,
		cardForeground: foreground,
		popover: elevated,
		popoverForeground: foreground,
		primary,
		primaryForeground: background,
		secondary: surface,
		secondaryForeground: foreground,
		muted: surface,
		mutedForeground: muted,
		accent,
		accentForeground: foreground,
		tertiary: surface,
		tertiaryActive: accent,
		destructive,
		destructiveForeground: appearance === "dark" ? "#ffdddd" : "#330000",
		border,
		input: border,
		ring: color(style, ["border.focused", "border"], border),
		sidebar: color(
			style,
			["panel.background", "surface.background", "background"],
			surface,
		),
		sidebarForeground: foreground,
		sidebarPrimary: primary,
		sidebarPrimaryForeground: background,
		sidebarAccent: accent,
		sidebarAccentForeground: foreground,
		sidebarBorder: border,
		sidebarRing: border,
		chart1: color(style, ["terminal.ansi.red"], "#e07850"),
		chart2: color(style, ["terminal.ansi.green"], "#50a878"),
		chart3: color(style, ["terminal.ansi.blue"], "#7b68ee"),
		chart4: color(style, ["terminal.ansi.yellow"], "#d4a84b"),
		chart5: color(style, ["terminal.ansi.magenta"], "#dc6b6b"),
		highlightMatch: color(
			style,
			["search.match_background", "element.selected"],
			accent,
		),
		highlightActive: color(
			style,
			["element.active", "element.selected"],
			primary,
		),
		highlight: primary,
		highlightForeground: background,
	};
}

/**
 * Convert a single Zed theme variant into a Rox {@link Theme}.
 *
 * @param zedTheme - the variant (from a family's `themes` array)
 * @param family - optional family metadata used for author and id prefixing
 * @returns a `Theme` flagged `isLibrary: true`, or `undefined` when the
 *   resolved id collides with a reserved Rox id (so callers can skip it).
 */
export function convertZedTheme(
	zedTheme: ZedTheme,
	family?: { name?: string; author?: string },
): Theme | undefined {
	const appearance: "dark" | "light" =
		zedTheme.appearance === "light" ? "light" : "dark";
	const style = zedTheme.style ?? {};

	const id = normalizeThemeId(zedTheme.name);
	if (!id || RESERVED_THEME_IDS.has(id)) {
		return undefined;
	}

	const ui = buildUIColors(style, appearance);
	const terminal = buildTerminalColors(style, appearance);

	const base: Theme = {
		id,
		name: zedTheme.name,
		author: family?.author,
		type: appearance,
		ui,
		terminal,
		isLibrary: true,
	};

	// Derive editor colors up-front so the library theme renders code without a
	// second resolution pass (parity with built-in themes).
	const editor = getEditorTheme(base);
	return {
		...base,
		editor: { colors: editor.colors, syntax: editor.syntax },
	};
}

/**
 * Convert a whole Zed theme family into Rox {@link Theme}s, skipping variants
 * whose ids collide with reserved Rox ids or with each other (de-duplicated by
 * id, first one wins).
 */
export function convertZedFamily(family: ZedThemeFamily): Theme[] {
	const seen = new Set<string>();
	const out: Theme[] = [];
	for (const zedTheme of family.themes ?? []) {
		const converted = convertZedTheme(zedTheme, {
			name: family.name,
			author: family.author,
		});
		if (!converted || seen.has(converted.id)) {
			continue;
		}
		seen.add(converted.id);
		out.push(converted);
	}
	return out;
}
