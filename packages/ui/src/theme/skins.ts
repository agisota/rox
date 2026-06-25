import type { UIColors } from "./colors";

/**
 * A *skin* is the named-palette half of the F08 Theme × Skin two-axis model.
 *
 * Skin (this) is orthogonal to Theme (light/dark/system). The Theme axis flips
 * the `.dark` class (and the globals.css `:root` / `.dark` OKLCH base ramp);
 * the Skin axis layers a named accent/chrome palette on top via `data-skin` +
 * CSS-var overrides.
 *
 * A skin only needs to override the handful of tokens that give it character
 * (primary / accent / ring, sometimes background tint). Every key it omits
 * falls through to the authoritative globals.css value for the active theme, so
 * adding a skin is ~10 lines.
 */
export interface Skin {
	/** Unique slug, also written to the root `data-skin` attribute. */
	id: string;
	/** Human-readable label for the skin picker. */
	name: string;
	/**
	 * Which theme axis this skin was tuned against. The picker can group by it;
	 * the override values assume the matching `.dark` / `:root` base ramp.
	 */
	type: "dark" | "light";
	/**
	 * CSS-var overrides for this skin. Partial: omitted keys inherit the active
	 * theme's globals.css default.
	 */
	ui: Partial<UIColors>;
}

/** The default skin: no overrides, pure globals.css ramp. */
export const DEFAULT_SKIN_ID = "default";

/**
 * Zed-derived skin library for the web.
 *
 * These mirror the families bundled for the desktop Zed library (One, Ayu,
 * Gruvbox, Rosé Pine, Catppuccin, Solarized, Andromeda, …) but expressed as
 * thin OKLCH overrides so they layer cleanly on the shared base ramp instead of
 * shipping a full per-skin palette. ~17 selectable skins (default + 16 named).
 */
export const SKINS: Skin[] = [
	{ id: DEFAULT_SKIN_ID, name: "Default", type: "dark", ui: {} },
	{
		id: "one-dark",
		name: "One Dark",
		type: "dark",
		ui: {
			primary: "oklch(0.7 0.13 250)",
			accent: "oklch(0.32 0.04 255)",
			ring: "oklch(0.7 0.13 250)",
		},
	},
	{
		id: "ayu-dark",
		name: "Ayu Dark",
		type: "dark",
		ui: {
			background: "oklch(0.2 0.02 250)",
			primary: "oklch(0.82 0.15 75)",
			accent: "oklch(0.34 0.06 75)",
			ring: "oklch(0.82 0.15 75)",
		},
	},
	{
		id: "gruvbox-dark",
		name: "Gruvbox Dark",
		type: "dark",
		ui: {
			background: "oklch(0.24 0.02 80)",
			primary: "oklch(0.78 0.13 80)",
			accent: "oklch(0.36 0.05 80)",
			ring: "oklch(0.78 0.13 80)",
		},
	},
	{
		id: "rose-pine",
		name: "Rosé Pine",
		type: "dark",
		ui: {
			background: "oklch(0.22 0.02 300)",
			primary: "oklch(0.78 0.1 20)",
			accent: "oklch(0.36 0.05 300)",
			ring: "oklch(0.78 0.1 20)",
		},
	},
	{
		id: "catppuccin-mocha",
		name: "Catppuccin Mocha",
		type: "dark",
		ui: {
			background: "oklch(0.24 0.03 285)",
			primary: "oklch(0.8 0.11 305)",
			accent: "oklch(0.36 0.06 285)",
			ring: "oklch(0.8 0.11 305)",
		},
	},
	{
		id: "andromeda",
		name: "Andromeda",
		type: "dark",
		ui: {
			background: "oklch(0.24 0.03 250)",
			primary: "oklch(0.78 0.13 175)",
			accent: "oklch(0.36 0.06 250)",
			ring: "oklch(0.78 0.13 175)",
		},
	},
	{
		id: "nord",
		name: "Nord",
		type: "dark",
		ui: {
			background: "oklch(0.28 0.03 255)",
			primary: "oklch(0.78 0.08 220)",
			accent: "oklch(0.4 0.04 255)",
			ring: "oklch(0.78 0.08 220)",
		},
	},
	{
		id: "dracula",
		name: "Dracula",
		type: "dark",
		ui: {
			background: "oklch(0.26 0.03 285)",
			primary: "oklch(0.78 0.13 320)",
			accent: "oklch(0.38 0.06 285)",
			ring: "oklch(0.78 0.13 320)",
		},
	},
	{
		id: "tokyo-night",
		name: "Tokyo Night",
		type: "dark",
		ui: {
			background: "oklch(0.22 0.03 265)",
			primary: "oklch(0.74 0.12 265)",
			accent: "oklch(0.34 0.06 265)",
			ring: "oklch(0.74 0.12 265)",
		},
	},
	{
		id: "solarized-dark",
		name: "Solarized Dark",
		type: "dark",
		ui: {
			background: "oklch(0.27 0.03 210)",
			primary: "oklch(0.72 0.13 200)",
			accent: "oklch(0.38 0.05 210)",
			ring: "oklch(0.72 0.13 200)",
		},
	},
	{
		id: "one-light",
		name: "One Light",
		type: "light",
		ui: {
			primary: "oklch(0.55 0.16 250)",
			accent: "oklch(0.92 0.03 250)",
			ring: "oklch(0.55 0.16 250)",
		},
	},
	{
		id: "ayu-light",
		name: "Ayu Light",
		type: "light",
		ui: {
			background: "oklch(0.99 0.01 75)",
			primary: "oklch(0.62 0.16 60)",
			accent: "oklch(0.93 0.04 75)",
			ring: "oklch(0.62 0.16 60)",
		},
	},
	{
		id: "gruvbox-light",
		name: "Gruvbox Light",
		type: "light",
		ui: {
			background: "oklch(0.96 0.02 80)",
			primary: "oklch(0.55 0.15 40)",
			accent: "oklch(0.9 0.04 80)",
			ring: "oklch(0.55 0.15 40)",
		},
	},
	{
		id: "rose-pine-dawn",
		name: "Rosé Pine Dawn",
		type: "light",
		ui: {
			background: "oklch(0.97 0.01 60)",
			primary: "oklch(0.6 0.1 20)",
			accent: "oklch(0.92 0.03 300)",
			ring: "oklch(0.6 0.1 20)",
		},
	},
	{
		id: "catppuccin-latte",
		name: "Catppuccin Latte",
		type: "light",
		ui: {
			background: "oklch(0.96 0.01 285)",
			primary: "oklch(0.55 0.16 285)",
			accent: "oklch(0.91 0.03 285)",
			ring: "oklch(0.55 0.16 285)",
		},
	},
	{
		id: "solarized-light",
		name: "Solarized Light",
		type: "light",
		ui: {
			background: "oklch(0.97 0.02 90)",
			primary: "oklch(0.58 0.13 200)",
			accent: "oklch(0.91 0.03 90)",
			ring: "oklch(0.58 0.13 200)",
		},
	},
];

const SKINS_BY_ID = new Map(SKINS.map((skin) => [skin.id, skin]));

/** The default skin object (first entry; always present). */
export const DEFAULT_SKIN: Skin = SKINS[0] as Skin;

/** Look up a skin by id, falling back to the default skin when unknown. */
export function getSkin(id: string): Skin {
	return SKINS_BY_ID.get(id) ?? DEFAULT_SKIN;
}
