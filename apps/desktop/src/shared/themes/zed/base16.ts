/**
 * base16 / base24 → Zed-style adapter (themes-fonts epic).
 *
 * The bulk of the bundled theme library comes from the canonical
 * {@link https://github.com/tinted-theming/schemes tinted-theming/schemes}
 * collection (~500 base16 + base24 palettes). Rather than add a second
 * conversion pipeline, each scheme is mapped onto the same Zed `style` shape the
 * {@link convertZedTheme} converter already understands, so library themes built
 * from base16 data stay byte-for-byte consistent with Zed-derived ones.
 *
 * This module is pure (no filesystem / network); the generator script
 * (`scripts/convert-zed-themes.ts`) reads the YAML scheme files and feeds the
 * parsed objects through here.
 */
import type { ZedThemeFamily } from "./convert";

export type Base16System = "base16" | "base24";

/**
 * A parsed tinted-theming scheme. `palette` keys are the canonical base16/base24
 * slots (`base00`–`base17`), normalized to lowercase (e.g. `base0a`).
 */
export interface Base16Scheme {
	system: Base16System;
	name: string;
	author?: string;
	variant: "dark" | "light";
	palette: Record<string, string>;
}

/** Read a palette slot, normalizing case so `base0A`/`base0a` both resolve. */
function slot(
	palette: Record<string, string>,
	key: string,
): string | undefined {
	const value = palette[key.toLowerCase()];
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

/** Read a slot with an ordered fallback chain; returns the first hit or `""`. */
function pickSlot(
	palette: Record<string, string>,
	keys: string[],
): string | undefined {
	for (const key of keys) {
		const value = slot(palette, key);
		if (value) {
			return value;
		}
	}
	return undefined;
}

/**
 * Canonical base16 terminal ANSI mapping (matches the upstream base16 Alacritty/
 * Kitty templates): normal 1–6 reused for the brights, with `base03`/`base07`
 * as bright-black/bright-white.
 */
function base16AnsiStyle(p: Record<string, string>): Record<string, string> {
	const get = (key: string) => slot(p, key) ?? "";
	return {
		"terminal.ansi.black": get("base00"),
		"terminal.ansi.red": get("base08"),
		"terminal.ansi.green": get("base0b"),
		"terminal.ansi.yellow": get("base0a"),
		"terminal.ansi.blue": get("base0d"),
		"terminal.ansi.magenta": get("base0e"),
		"terminal.ansi.cyan": get("base0c"),
		"terminal.ansi.white": get("base05"),
		"terminal.ansi.bright_black": get("base03"),
		"terminal.ansi.bright_red": get("base08"),
		"terminal.ansi.bright_green": get("base0b"),
		"terminal.ansi.bright_yellow": get("base0a"),
		"terminal.ansi.bright_blue": get("base0d"),
		"terminal.ansi.bright_magenta": get("base0e"),
		"terminal.ansi.bright_cyan": get("base0c"),
		"terminal.ansi.bright_white": get("base07"),
	};
}

/**
 * base24 terminal ANSI mapping (per the base24 styling spec): dedicated bright
 * slots `base12`–`base17` plus `base02`/`base07` for bright-black/white.
 */
function base24AnsiStyle(p: Record<string, string>): Record<string, string> {
	const get = (key: string, fallback: string) =>
		slot(p, key) ?? slot(p, fallback) ?? "";
	return {
		"terminal.ansi.black": get("base01", "base00"),
		"terminal.ansi.red": get("base08", "base08"),
		"terminal.ansi.green": get("base0b", "base0b"),
		"terminal.ansi.yellow": get("base0a", "base0a"),
		"terminal.ansi.blue": get("base0d", "base0d"),
		"terminal.ansi.magenta": get("base0e", "base0e"),
		"terminal.ansi.cyan": get("base0c", "base0c"),
		"terminal.ansi.white": get("base06", "base05"),
		"terminal.ansi.bright_black": get("base02", "base03"),
		"terminal.ansi.bright_red": get("base12", "base08"),
		"terminal.ansi.bright_green": get("base14", "base0b"),
		"terminal.ansi.bright_yellow": get("base13", "base0a"),
		"terminal.ansi.bright_blue": get("base16", "base0d"),
		"terminal.ansi.bright_magenta": get("base17", "base0e"),
		"terminal.ansi.bright_cyan": get("base15", "base0c"),
		"terminal.ansi.bright_white": get("base07", "base05"),
	};
}

/**
 * Map a base16/base24 scheme onto the Zed `style` map. The base16 slot
 * semantics (base00 = background … base05 = foreground, base08–base0F = accent
 * ramp) line up cleanly with the keys {@link convertZedTheme} reads.
 */
export function base16ToZedStyle(scheme: Base16Scheme): Record<string, string> {
	// Normalize palette keys to lowercase up-front so callers may pass the
	// canonical `base0A` casing as well as the lowercased form.
	const p: Record<string, string> = {};
	for (const [key, value] of Object.entries(scheme.palette)) {
		p[key.toLowerCase()] = value;
	}
	const get = (key: string) => slot(p, key) ?? "";

	const background = get("base00");
	const foreground = pickSlot(p, ["base05"]) ?? "#e0e0e0";
	const accent = pickSlot(p, ["base0d"]) ?? foreground;

	const ansi =
		scheme.system === "base24" ? base24AnsiStyle(p) : base16AnsiStyle(p);

	return {
		background,
		text: foreground,
		"text.muted": pickSlot(p, ["base04", "base03"]) ?? foreground,
		"text.disabled": pickSlot(p, ["base03"]) ?? foreground,
		"text.accent": accent,
		"surface.background": pickSlot(p, ["base01"]) ?? background,
		"elevated_surface.background":
			pickSlot(p, ["base02", "base01"]) ?? background,
		"element.background": pickSlot(p, ["base01"]) ?? background,
		"element.selected": pickSlot(p, ["base02"]) ?? background,
		"element.hover": pickSlot(p, ["base02"]) ?? background,
		"element.active": pickSlot(p, ["base03", "base02"]) ?? background,
		border: pickSlot(p, ["base02", "base03"]) ?? background,
		"border.variant": pickSlot(p, ["base01"]) ?? background,
		"border.focused": accent,
		error: pickSlot(p, ["base08"]) ?? "#cc4444",
		"panel.background": pickSlot(p, ["base01"]) ?? background,
		"editor.background": background,
		"editor.foreground": foreground,
		"search.match_background": pickSlot(p, ["base02"]) ?? background,
		"terminal.background": background,
		"terminal.foreground": foreground,
		...ansi,
	};
}

/**
 * Wrap a base16/base24 scheme as a single-theme {@link ZedThemeFamily} so it can
 * flow through {@link convertZedFamily} alongside native Zed families.
 */
export function base16ToZedFamily(scheme: Base16Scheme): ZedThemeFamily {
	return {
		name: scheme.name,
		author: scheme.author,
		themes: [
			{
				name: scheme.name,
				appearance: scheme.variant === "light" ? "light" : "dark",
				style: base16ToZedStyle(scheme),
			},
		],
	};
}
