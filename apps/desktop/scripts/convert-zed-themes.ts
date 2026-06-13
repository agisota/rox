#!/usr/bin/env bun
/**
 * Generate the bundled Zed theme library dataset.
 *
 * Reads Zed theme family JSON files and converts them into Rox `Theme` objects
 * via {@link convertZedFamily}, writing the result to
 * `src/shared/themes/zed/generated/zed-themes.json`.
 *
 * Usage:
 *   bun run apps/desktop/scripts/convert-zed-themes.ts [zedThemesDir] \
 *     [--schemes <tintedThemingSchemesDir>]
 *
 * Sources (all optional, merged in priority order — first writer of an id wins):
 *   1. A small embedded sample of canonical Zed families (always included so the
 *      dataset is reproducible without any clone/network step).
 *   2. `zedThemesDir` — a checkout of `zed-industries/zed/assets/themes`
 *      (each `*.json` is one family).
 *   3. `--schemes <dir>` — a checkout of `tinted-theming/schemes` (base16 +
 *      base24 YAML palettes, ~500 entries). This is what grows the bundle to the
 *      full library; each scheme is adapted onto the Zed `style` shape via
 *      {@link base16ToZedFamily} so it converts through the same pipeline.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
	type Base16Scheme,
	type Base16System,
	base16ToZedFamily,
} from "../src/shared/themes/zed/base16";
import {
	convertZedFamily,
	type ZedThemeFamily,
} from "../src/shared/themes/zed/convert";

const OUT_PATH = resolve(
	import.meta.dir,
	"../src/shared/themes/zed/generated/zed-themes.json",
);

/**
 * A compact embedded sample of canonical Zed families. These are real Zed
 * `style` palettes (trimmed to the keys the converter reads) so the generated
 * dataset round-trips against the converter even without the upstream repo.
 */
const EMBEDDED_FAMILIES: ZedThemeFamily[] = [
	{
		name: "One",
		author: "Zed Industries",
		themes: [
			{
				name: "One Dark",
				appearance: "dark",
				style: {
					background: "#282c33",
					text: "#dce0e5",
					"text.muted": "#838994",
					border: "#464b57",
					"surface.background": "#2f343e",
					"elevated_surface.background": "#2f343e",
					"element.background": "#3b414d",
					"element.selected": "#454a56",
					"element.active": "#454a56",
					"text.accent": "#74ade8",
					error: "#d07277",
					"editor.background": "#282c33",
					"editor.foreground": "#dce0e5",
					"panel.background": "#2f343e",
					"terminal.background": "#282c33",
					"terminal.foreground": "#dce0e5",
					"terminal.ansi.black": "#000000",
					"terminal.ansi.red": "#d07277",
					"terminal.ansi.green": "#a1c181",
					"terminal.ansi.yellow": "#dec184",
					"terminal.ansi.blue": "#74ade8",
					"terminal.ansi.magenta": "#b477cf",
					"terminal.ansi.cyan": "#6eb4bf",
					"terminal.ansi.white": "#dce0e5",
					"terminal.ansi.bright_black": "#525561",
					"terminal.ansi.bright_red": "#673a3c",
					"terminal.ansi.bright_green": "#4d5a3d",
					"terminal.ansi.bright_yellow": "#6c5f3f",
					"terminal.ansi.bright_blue": "#385378",
					"terminal.ansi.bright_magenta": "#583b67",
					"terminal.ansi.bright_cyan": "#355a60",
					"terminal.ansi.bright_white": "#feffff",
				},
			},
			{
				name: "One Light",
				appearance: "light",
				style: {
					background: "#fafafa",
					text: "#383a41",
					"text.muted": "#7f8188",
					border: "#c9c9ca",
					"surface.background": "#ececec",
					"elevated_surface.background": "#ececec",
					"element.background": "#dfdfe0",
					"element.selected": "#dcdcdd",
					"element.active": "#dcdcdd",
					"text.accent": "#5c79e2",
					error: "#d36151",
					"editor.background": "#fafafa",
					"editor.foreground": "#383a41",
					"panel.background": "#ececec",
					"terminal.background": "#fafafa",
					"terminal.foreground": "#383a41",
					"terminal.ansi.black": "#383a41",
					"terminal.ansi.red": "#d36151",
					"terminal.ansi.green": "#669f59",
					"terminal.ansi.yellow": "#dec184",
					"terminal.ansi.blue": "#5c79e2",
					"terminal.ansi.magenta": "#a449ab",
					"terminal.ansi.cyan": "#3a82b7",
					"terminal.ansi.white": "#f0f0f0",
					"terminal.ansi.bright_black": "#a1a1a2",
					"terminal.ansi.bright_red": "#eabbb4",
					"terminal.ansi.bright_green": "#c1d5b9",
					"terminal.ansi.bright_yellow": "#f0e4c9",
					"terminal.ansi.bright_blue": "#bdc9f4",
					"terminal.ansi.bright_magenta": "#dcb0df",
					"terminal.ansi.bright_cyan": "#aacadf",
					"terminal.ansi.bright_white": "#ffffff",
				},
			},
		],
	},
	{
		name: "Ayu",
		author: "Zed Industries",
		themes: [
			{
				name: "Ayu Dark",
				appearance: "dark",
				style: {
					background: "#0d1017",
					text: "#bfbdb6",
					"text.muted": "#8a8986",
					border: "#1e232b",
					"surface.background": "#11151c",
					"element.selected": "#1b202a",
					"text.accent": "#5ac1fe",
					error: "#d95757",
					"editor.background": "#0d1017",
					"editor.foreground": "#bfbdb6",
					"terminal.background": "#0d1017",
					"terminal.foreground": "#bfbdb6",
					"terminal.ansi.black": "#0d1017",
					"terminal.ansi.red": "#d95757",
					"terminal.ansi.green": "#7fd962",
					"terminal.ansi.yellow": "#ffb454",
					"terminal.ansi.blue": "#5ac1fe",
					"terminal.ansi.magenta": "#d2a6ff",
					"terminal.ansi.cyan": "#73cfff",
					"terminal.ansi.white": "#bfbdb6",
					"terminal.ansi.bright_black": "#5c6773",
					"terminal.ansi.bright_red": "#f07171",
					"terminal.ansi.bright_green": "#aad94c",
					"terminal.ansi.bright_yellow": "#ffd173",
					"terminal.ansi.bright_blue": "#73d0ff",
					"terminal.ansi.bright_magenta": "#dfbfff",
					"terminal.ansi.bright_cyan": "#95e6cb",
					"terminal.ansi.bright_white": "#ffffff",
				},
			},
			{
				name: "Ayu Mirage",
				appearance: "dark",
				style: {
					background: "#1f2430",
					text: "#cccac2",
					"text.muted": "#8a9199",
					border: "#2b3140",
					"surface.background": "#232834",
					"element.selected": "#2d3340",
					"text.accent": "#73d0ff",
					error: "#ff6666",
					"editor.background": "#1f2430",
					"editor.foreground": "#cccac2",
					"terminal.background": "#1f2430",
					"terminal.foreground": "#cccac2",
					"terminal.ansi.black": "#1f2430",
					"terminal.ansi.red": "#ed8274",
					"terminal.ansi.green": "#87d96c",
					"terminal.ansi.yellow": "#fad07b",
					"terminal.ansi.blue": "#6dcbfa",
					"terminal.ansi.magenta": "#cfbafa",
					"terminal.ansi.cyan": "#90e1c6",
					"terminal.ansi.white": "#c7c7c7",
					"terminal.ansi.bright_black": "#686868",
					"terminal.ansi.bright_red": "#f28779",
					"terminal.ansi.bright_green": "#d5ff80",
					"terminal.ansi.bright_yellow": "#ffd173",
					"terminal.ansi.bright_blue": "#73d0ff",
					"terminal.ansi.bright_magenta": "#dfbfff",
					"terminal.ansi.bright_cyan": "#95e6cb",
					"terminal.ansi.bright_white": "#ffffff",
				},
			},
		],
	},
	{
		name: "Gruvbox",
		author: "Zed Industries",
		themes: [
			{
				name: "Gruvbox Dark Hard",
				appearance: "dark",
				style: {
					background: "#1d2021",
					text: "#fbf1c7",
					"text.muted": "#a89984",
					border: "#3c3836",
					"surface.background": "#282828",
					"element.selected": "#3c3836",
					"text.accent": "#83a598",
					error: "#fb4934",
					"editor.background": "#1d2021",
					"editor.foreground": "#fbf1c7",
					"terminal.background": "#1d2021",
					"terminal.foreground": "#fbf1c7",
					"terminal.ansi.black": "#1d2021",
					"terminal.ansi.red": "#cc241d",
					"terminal.ansi.green": "#98971a",
					"terminal.ansi.yellow": "#d79921",
					"terminal.ansi.blue": "#458588",
					"terminal.ansi.magenta": "#b16286",
					"terminal.ansi.cyan": "#689d6a",
					"terminal.ansi.white": "#a89984",
					"terminal.ansi.bright_black": "#928374",
					"terminal.ansi.bright_red": "#fb4934",
					"terminal.ansi.bright_green": "#b8bb26",
					"terminal.ansi.bright_yellow": "#fabd2f",
					"terminal.ansi.bright_blue": "#83a598",
					"terminal.ansi.bright_magenta": "#d3869b",
					"terminal.ansi.bright_cyan": "#8ec07c",
					"terminal.ansi.bright_white": "#ebdbb2",
				},
			},
			{
				name: "Gruvbox Light Hard",
				appearance: "light",
				style: {
					background: "#f9f5d7",
					text: "#3c3836",
					"text.muted": "#7c6f64",
					border: "#d5c4a1",
					"surface.background": "#fbf1c7",
					"element.selected": "#ebdbb2",
					"text.accent": "#076678",
					error: "#9d0006",
					"editor.background": "#f9f5d7",
					"editor.foreground": "#3c3836",
					"terminal.background": "#f9f5d7",
					"terminal.foreground": "#3c3836",
					"terminal.ansi.black": "#fbf1c7",
					"terminal.ansi.red": "#cc241d",
					"terminal.ansi.green": "#98971a",
					"terminal.ansi.yellow": "#d79921",
					"terminal.ansi.blue": "#458588",
					"terminal.ansi.magenta": "#b16286",
					"terminal.ansi.cyan": "#689d6a",
					"terminal.ansi.white": "#7c6f64",
					"terminal.ansi.bright_black": "#928374",
					"terminal.ansi.bright_red": "#9d0006",
					"terminal.ansi.bright_green": "#79740e",
					"terminal.ansi.bright_yellow": "#b57614",
					"terminal.ansi.bright_blue": "#076678",
					"terminal.ansi.bright_magenta": "#8f3f71",
					"terminal.ansi.bright_cyan": "#427b58",
					"terminal.ansi.bright_white": "#3c3836",
				},
			},
		],
	},
	{
		name: "Bearded",
		author: "BeardedBunch",
		themes: [
			{
				name: "Bearded Theme Altica",
				appearance: "dark",
				style: {
					background: "#0c1116",
					text: "#c2c9d6",
					"text.muted": "#6b7689",
					border: "#1c232c",
					"surface.background": "#121820",
					"elevated_surface.background": "#161d27",
					"element.background": "#1a222d",
					"element.selected": "#1e2630",
					"element.active": "#1e2630",
					"text.accent": "#41b9c0",
					error: "#fc6a6e",
					"editor.background": "#0c1116",
					"editor.foreground": "#c2c9d6",
					"panel.background": "#0e141b",
					"terminal.background": "#0c1116",
					"terminal.foreground": "#c2c9d6",
					"terminal.ansi.black": "#0c1116",
					"terminal.ansi.red": "#fc6a6e",
					"terminal.ansi.green": "#2fcaa0",
					"terminal.ansi.yellow": "#f9c859",
					"terminal.ansi.blue": "#4ec3e0",
					"terminal.ansi.magenta": "#c46af5",
					"terminal.ansi.cyan": "#41b9c0",
					"terminal.ansi.white": "#c2c9d6",
					"terminal.ansi.bright_black": "#4a5568",
					"terminal.ansi.bright_red": "#ff8a8d",
					"terminal.ansi.bright_green": "#5be0bb",
					"terminal.ansi.bright_yellow": "#ffd97a",
					"terminal.ansi.bright_blue": "#74d4ee",
					"terminal.ansi.bright_magenta": "#d493ff",
					"terminal.ansi.bright_cyan": "#63d2d8",
					"terminal.ansi.bright_white": "#eef2f7",
				},
			},
		],
	},
	{
		name: "Catppuccin",
		author: "Catppuccin",
		themes: [
			{
				name: "Catppuccin Mocha",
				appearance: "dark",
				style: {
					background: "#1e1e2e",
					text: "#cdd6f4",
					"text.muted": "#a6adc8",
					border: "#313244",
					"surface.background": "#181825",
					"elevated_surface.background": "#11111b",
					"element.background": "#313244",
					"element.selected": "#45475a",
					"element.active": "#45475a",
					"text.accent": "#89b4fa",
					error: "#f38ba8",
					"editor.background": "#1e1e2e",
					"editor.foreground": "#cdd6f4",
					"panel.background": "#181825",
					"terminal.background": "#1e1e2e",
					"terminal.foreground": "#cdd6f4",
					"terminal.ansi.black": "#45475a",
					"terminal.ansi.red": "#f38ba8",
					"terminal.ansi.green": "#a6e3a1",
					"terminal.ansi.yellow": "#f9e2af",
					"terminal.ansi.blue": "#89b4fa",
					"terminal.ansi.magenta": "#f5c2e7",
					"terminal.ansi.cyan": "#94e2d5",
					"terminal.ansi.white": "#bac2de",
					"terminal.ansi.bright_black": "#585b70",
					"terminal.ansi.bright_red": "#f38ba8",
					"terminal.ansi.bright_green": "#a6e3a1",
					"terminal.ansi.bright_yellow": "#f9e2af",
					"terminal.ansi.bright_blue": "#89b4fa",
					"terminal.ansi.bright_magenta": "#f5c2e7",
					"terminal.ansi.bright_cyan": "#94e2d5",
					"terminal.ansi.bright_white": "#a6adc8",
				},
			},
			{
				name: "Catppuccin Macchiato",
				appearance: "dark",
				style: {
					background: "#24273a",
					text: "#cad3f5",
					"text.muted": "#a5adcb",
					border: "#363a4f",
					"surface.background": "#1e2030",
					"elevated_surface.background": "#181926",
					"element.background": "#363a4f",
					"element.selected": "#494d64",
					"element.active": "#494d64",
					"text.accent": "#8aadf4",
					error: "#ed8796",
					"editor.background": "#24273a",
					"editor.foreground": "#cad3f5",
					"panel.background": "#1e2030",
					"terminal.background": "#24273a",
					"terminal.foreground": "#cad3f5",
					"terminal.ansi.black": "#494d64",
					"terminal.ansi.red": "#ed8796",
					"terminal.ansi.green": "#a6da95",
					"terminal.ansi.yellow": "#eed49f",
					"terminal.ansi.blue": "#8aadf4",
					"terminal.ansi.magenta": "#f5bde6",
					"terminal.ansi.cyan": "#8bd5ca",
					"terminal.ansi.white": "#b8c0e0",
					"terminal.ansi.bright_black": "#5b6078",
					"terminal.ansi.bright_red": "#ed8796",
					"terminal.ansi.bright_green": "#a6da95",
					"terminal.ansi.bright_yellow": "#eed49f",
					"terminal.ansi.bright_blue": "#8aadf4",
					"terminal.ansi.bright_magenta": "#f5bde6",
					"terminal.ansi.bright_cyan": "#8bd5ca",
					"terminal.ansi.bright_white": "#a5adcb",
				},
			},
			{
				name: "Catppuccin Frappe",
				appearance: "dark",
				style: {
					background: "#303446",
					text: "#c6d0f5",
					"text.muted": "#a5adce",
					border: "#414559",
					"surface.background": "#292c3c",
					"elevated_surface.background": "#232634",
					"element.background": "#414559",
					"element.selected": "#51576d",
					"element.active": "#51576d",
					"text.accent": "#8caaee",
					error: "#e78284",
					"editor.background": "#303446",
					"editor.foreground": "#c6d0f5",
					"panel.background": "#292c3c",
					"terminal.background": "#303446",
					"terminal.foreground": "#c6d0f5",
					"terminal.ansi.black": "#51576d",
					"terminal.ansi.red": "#e78284",
					"terminal.ansi.green": "#a6d189",
					"terminal.ansi.yellow": "#e5c890",
					"terminal.ansi.blue": "#8caaee",
					"terminal.ansi.magenta": "#f4b8e4",
					"terminal.ansi.cyan": "#81c8be",
					"terminal.ansi.white": "#b5bfe2",
					"terminal.ansi.bright_black": "#626880",
					"terminal.ansi.bright_red": "#e78284",
					"terminal.ansi.bright_green": "#a6d189",
					"terminal.ansi.bright_yellow": "#e5c890",
					"terminal.ansi.bright_blue": "#8caaee",
					"terminal.ansi.bright_magenta": "#f4b8e4",
					"terminal.ansi.bright_cyan": "#81c8be",
					"terminal.ansi.bright_white": "#a5adce",
				},
			},
			{
				name: "Catppuccin Latte",
				appearance: "light",
				style: {
					background: "#eff1f5",
					text: "#4c4f69",
					"text.muted": "#6c6f85",
					border: "#ccd0da",
					"surface.background": "#e6e9ef",
					"elevated_surface.background": "#dce0e8",
					"element.background": "#ccd0da",
					"element.selected": "#bcc0cc",
					"element.active": "#bcc0cc",
					"text.accent": "#1e66f5",
					error: "#d20f39",
					"editor.background": "#eff1f5",
					"editor.foreground": "#4c4f69",
					"panel.background": "#e6e9ef",
					"terminal.background": "#eff1f5",
					"terminal.foreground": "#4c4f69",
					"terminal.ansi.black": "#5c5f77",
					"terminal.ansi.red": "#d20f39",
					"terminal.ansi.green": "#40a02b",
					"terminal.ansi.yellow": "#df8e1d",
					"terminal.ansi.blue": "#1e66f5",
					"terminal.ansi.magenta": "#ea76cb",
					"terminal.ansi.cyan": "#179299",
					"terminal.ansi.white": "#acb0be",
					"terminal.ansi.bright_black": "#6c6f85",
					"terminal.ansi.bright_red": "#d20f39",
					"terminal.ansi.bright_green": "#40a02b",
					"terminal.ansi.bright_yellow": "#df8e1d",
					"terminal.ansi.bright_blue": "#1e66f5",
					"terminal.ansi.bright_magenta": "#ea76cb",
					"terminal.ansi.bright_cyan": "#179299",
					"terminal.ansi.bright_white": "#bcc0cc",
				},
			},
		],
	},
	{
		name: "Tokyo Night",
		author: "Folke Lemaitre",
		themes: [
			{
				name: "Tokyo Night",
				appearance: "dark",
				style: {
					background: "#1a1b26",
					text: "#a9b1d6",
					"text.muted": "#565f89",
					border: "#15161e",
					"surface.background": "#16161e",
					"elevated_surface.background": "#1f2335",
					"element.background": "#1f2335",
					"element.selected": "#283457",
					"element.active": "#283457",
					"text.accent": "#7aa2f7",
					error: "#f7768e",
					"editor.background": "#1a1b26",
					"editor.foreground": "#a9b1d6",
					"panel.background": "#16161e",
					"terminal.background": "#1a1b26",
					"terminal.foreground": "#a9b1d6",
					"terminal.ansi.black": "#15161e",
					"terminal.ansi.red": "#f7768e",
					"terminal.ansi.green": "#9ece6a",
					"terminal.ansi.yellow": "#e0af68",
					"terminal.ansi.blue": "#7aa2f7",
					"terminal.ansi.magenta": "#bb9af7",
					"terminal.ansi.cyan": "#7dcfff",
					"terminal.ansi.white": "#a9b1d6",
					"terminal.ansi.bright_black": "#414868",
					"terminal.ansi.bright_red": "#f7768e",
					"terminal.ansi.bright_green": "#9ece6a",
					"terminal.ansi.bright_yellow": "#e0af68",
					"terminal.ansi.bright_blue": "#7aa2f7",
					"terminal.ansi.bright_magenta": "#bb9af7",
					"terminal.ansi.bright_cyan": "#7dcfff",
					"terminal.ansi.bright_white": "#c0caf5",
				},
			},
			{
				name: "Tokyo Night Storm",
				appearance: "dark",
				style: {
					background: "#24283b",
					text: "#a9b1d6",
					"text.muted": "#565f89",
					border: "#1d202f",
					"surface.background": "#1d202f",
					"elevated_surface.background": "#222436",
					"element.background": "#292e42",
					"element.selected": "#2e3c64",
					"element.active": "#2e3c64",
					"text.accent": "#7aa2f7",
					error: "#f7768e",
					"editor.background": "#24283b",
					"editor.foreground": "#a9b1d6",
					"panel.background": "#1d202f",
					"terminal.background": "#24283b",
					"terminal.foreground": "#a9b1d6",
					"terminal.ansi.black": "#1d202f",
					"terminal.ansi.red": "#f7768e",
					"terminal.ansi.green": "#9ece6a",
					"terminal.ansi.yellow": "#e0af68",
					"terminal.ansi.blue": "#7aa2f7",
					"terminal.ansi.magenta": "#bb9af7",
					"terminal.ansi.cyan": "#7dcfff",
					"terminal.ansi.white": "#a9b1d6",
					"terminal.ansi.bright_black": "#414868",
					"terminal.ansi.bright_red": "#f7768e",
					"terminal.ansi.bright_green": "#9ece6a",
					"terminal.ansi.bright_yellow": "#e0af68",
					"terminal.ansi.bright_blue": "#7aa2f7",
					"terminal.ansi.bright_magenta": "#bb9af7",
					"terminal.ansi.bright_cyan": "#7dcfff",
					"terminal.ansi.bright_white": "#c0caf5",
				},
			},
			{
				name: "Tokyo Night Light",
				appearance: "light",
				style: {
					background: "#d5d6db",
					text: "#343b58",
					"text.muted": "#9699a3",
					border: "#cbccd1",
					"surface.background": "#cbccd1",
					"elevated_surface.background": "#e1e2e7",
					"element.background": "#c4c8da",
					"element.selected": "#b6bacb",
					"element.active": "#b6bacb",
					"text.accent": "#34548a",
					error: "#8c4351",
					"editor.background": "#d5d6db",
					"editor.foreground": "#343b58",
					"panel.background": "#cbccd1",
					"terminal.background": "#d5d6db",
					"terminal.foreground": "#343b58",
					"terminal.ansi.black": "#0f0f14",
					"terminal.ansi.red": "#8c4351",
					"terminal.ansi.green": "#485e30",
					"terminal.ansi.yellow": "#8f5e15",
					"terminal.ansi.blue": "#34548a",
					"terminal.ansi.magenta": "#5a4a78",
					"terminal.ansi.cyan": "#0f4b6e",
					"terminal.ansi.white": "#343b58",
					"terminal.ansi.bright_black": "#9699a3",
					"terminal.ansi.bright_red": "#8c4351",
					"terminal.ansi.bright_green": "#485e30",
					"terminal.ansi.bright_yellow": "#8f5e15",
					"terminal.ansi.bright_blue": "#34548a",
					"terminal.ansi.bright_magenta": "#5a4a78",
					"terminal.ansi.bright_cyan": "#0f4b6e",
					"terminal.ansi.bright_white": "#343b58",
				},
			},
		],
	},
	{
		name: "Rose Pine",
		author: "Rose Pine",
		themes: [
			{
				name: "Rose Pine",
				appearance: "dark",
				style: {
					background: "#191724",
					text: "#e0def4",
					"text.muted": "#6e6a86",
					border: "#26233a",
					"surface.background": "#1f1d2e",
					"elevated_surface.background": "#26233a",
					"element.background": "#26233a",
					"element.selected": "#403d52",
					"element.active": "#403d52",
					"text.accent": "#c4a7e7",
					error: "#eb6f92",
					"editor.background": "#191724",
					"editor.foreground": "#e0def4",
					"panel.background": "#1f1d2e",
					"terminal.background": "#191724",
					"terminal.foreground": "#e0def4",
					"terminal.ansi.black": "#26233a",
					"terminal.ansi.red": "#eb6f92",
					"terminal.ansi.green": "#31748f",
					"terminal.ansi.yellow": "#f6c177",
					"terminal.ansi.blue": "#9ccfd8",
					"terminal.ansi.magenta": "#c4a7e7",
					"terminal.ansi.cyan": "#ebbcba",
					"terminal.ansi.white": "#e0def4",
					"terminal.ansi.bright_black": "#6e6a86",
					"terminal.ansi.bright_red": "#eb6f92",
					"terminal.ansi.bright_green": "#31748f",
					"terminal.ansi.bright_yellow": "#f6c177",
					"terminal.ansi.bright_blue": "#9ccfd8",
					"terminal.ansi.bright_magenta": "#c4a7e7",
					"terminal.ansi.bright_cyan": "#ebbcba",
					"terminal.ansi.bright_white": "#e0def4",
				},
			},
			{
				name: "Rose Pine Moon",
				appearance: "dark",
				style: {
					background: "#232136",
					text: "#e0def4",
					"text.muted": "#6e6a86",
					border: "#393552",
					"surface.background": "#2a273f",
					"elevated_surface.background": "#393552",
					"element.background": "#393552",
					"element.selected": "#44415a",
					"element.active": "#44415a",
					"text.accent": "#c4a7e7",
					error: "#eb6f92",
					"editor.background": "#232136",
					"editor.foreground": "#e0def4",
					"panel.background": "#2a273f",
					"terminal.background": "#232136",
					"terminal.foreground": "#e0def4",
					"terminal.ansi.black": "#393552",
					"terminal.ansi.red": "#eb6f92",
					"terminal.ansi.green": "#3e8fb0",
					"terminal.ansi.yellow": "#f6c177",
					"terminal.ansi.blue": "#9ccfd8",
					"terminal.ansi.magenta": "#c4a7e7",
					"terminal.ansi.cyan": "#ea9a97",
					"terminal.ansi.white": "#e0def4",
					"terminal.ansi.bright_black": "#6e6a86",
					"terminal.ansi.bright_red": "#eb6f92",
					"terminal.ansi.bright_green": "#3e8fb0",
					"terminal.ansi.bright_yellow": "#f6c177",
					"terminal.ansi.bright_blue": "#9ccfd8",
					"terminal.ansi.bright_magenta": "#c4a7e7",
					"terminal.ansi.bright_cyan": "#ea9a97",
					"terminal.ansi.bright_white": "#e0def4",
				},
			},
			{
				name: "Rose Pine Dawn",
				appearance: "light",
				style: {
					background: "#faf4ed",
					text: "#575279",
					"text.muted": "#9893a5",
					border: "#f2e9e1",
					"surface.background": "#fffaf3",
					"elevated_surface.background": "#f2e9e1",
					"element.background": "#f2e9e1",
					"element.selected": "#dfdad9",
					"element.active": "#dfdad9",
					"text.accent": "#907aa9",
					error: "#b4637a",
					"editor.background": "#faf4ed",
					"editor.foreground": "#575279",
					"panel.background": "#fffaf3",
					"terminal.background": "#faf4ed",
					"terminal.foreground": "#575279",
					"terminal.ansi.black": "#f2e9e1",
					"terminal.ansi.red": "#b4637a",
					"terminal.ansi.green": "#286983",
					"terminal.ansi.yellow": "#ea9d34",
					"terminal.ansi.blue": "#56949f",
					"terminal.ansi.magenta": "#907aa9",
					"terminal.ansi.cyan": "#d7827e",
					"terminal.ansi.white": "#575279",
					"terminal.ansi.bright_black": "#9893a5",
					"terminal.ansi.bright_red": "#b4637a",
					"terminal.ansi.bright_green": "#286983",
					"terminal.ansi.bright_yellow": "#ea9d34",
					"terminal.ansi.bright_blue": "#56949f",
					"terminal.ansi.bright_magenta": "#907aa9",
					"terminal.ansi.bright_cyan": "#d7827e",
					"terminal.ansi.bright_white": "#575279",
				},
			},
		],
	},
	{
		name: "Dracula",
		author: "Dracula Theme",
		themes: [
			{
				name: "Dracula",
				appearance: "dark",
				style: {
					background: "#282a36",
					text: "#f8f8f2",
					"text.muted": "#6272a4",
					border: "#44475a",
					"surface.background": "#21222c",
					"elevated_surface.background": "#343746",
					"element.background": "#343746",
					"element.selected": "#44475a",
					"element.active": "#44475a",
					"text.accent": "#bd93f9",
					error: "#ff5555",
					"editor.background": "#282a36",
					"editor.foreground": "#f8f8f2",
					"panel.background": "#21222c",
					"terminal.background": "#282a36",
					"terminal.foreground": "#f8f8f2",
					"terminal.ansi.black": "#21222c",
					"terminal.ansi.red": "#ff5555",
					"terminal.ansi.green": "#50fa7b",
					"terminal.ansi.yellow": "#f1fa8c",
					"terminal.ansi.blue": "#bd93f9",
					"terminal.ansi.magenta": "#ff79c6",
					"terminal.ansi.cyan": "#8be9fd",
					"terminal.ansi.white": "#f8f8f2",
					"terminal.ansi.bright_black": "#6272a4",
					"terminal.ansi.bright_red": "#ff6e6e",
					"terminal.ansi.bright_green": "#69ff94",
					"terminal.ansi.bright_yellow": "#ffffa5",
					"terminal.ansi.bright_blue": "#d6acff",
					"terminal.ansi.bright_magenta": "#ff92df",
					"terminal.ansi.bright_cyan": "#a4ffff",
					"terminal.ansi.bright_white": "#ffffff",
				},
			},
		],
	},
	{
		name: "Nord",
		author: "Arctic Ice Studio",
		themes: [
			{
				name: "Nord",
				appearance: "dark",
				style: {
					background: "#2e3440",
					text: "#d8dee9",
					"text.muted": "#4c566a",
					border: "#3b4252",
					"surface.background": "#3b4252",
					"elevated_surface.background": "#434c5e",
					"element.background": "#434c5e",
					"element.selected": "#4c566a",
					"element.active": "#4c566a",
					"text.accent": "#88c0d0",
					error: "#bf616a",
					"editor.background": "#2e3440",
					"editor.foreground": "#d8dee9",
					"panel.background": "#2e3440",
					"terminal.background": "#2e3440",
					"terminal.foreground": "#d8dee9",
					"terminal.ansi.black": "#3b4252",
					"terminal.ansi.red": "#bf616a",
					"terminal.ansi.green": "#a3be8c",
					"terminal.ansi.yellow": "#ebcb8b",
					"terminal.ansi.blue": "#81a1c1",
					"terminal.ansi.magenta": "#b48ead",
					"terminal.ansi.cyan": "#88c0d0",
					"terminal.ansi.white": "#e5e9f0",
					"terminal.ansi.bright_black": "#4c566a",
					"terminal.ansi.bright_red": "#bf616a",
					"terminal.ansi.bright_green": "#a3be8c",
					"terminal.ansi.bright_yellow": "#ebcb8b",
					"terminal.ansi.bright_blue": "#81a1c1",
					"terminal.ansi.bright_magenta": "#b48ead",
					"terminal.ansi.bright_cyan": "#8fbcbb",
					"terminal.ansi.bright_white": "#eceff4",
				},
			},
		],
	},
	{
		name: "Solarized",
		author: "Ethan Schoonover",
		themes: [
			{
				name: "Solarized Dark",
				appearance: "dark",
				style: {
					background: "#002b36",
					text: "#839496",
					"text.muted": "#586e75",
					border: "#073642",
					"surface.background": "#073642",
					"elevated_surface.background": "#08404f",
					"element.background": "#08404f",
					"element.selected": "#0b4b5c",
					"element.active": "#0b4b5c",
					"text.accent": "#268bd2",
					error: "#dc322f",
					"editor.background": "#002b36",
					"editor.foreground": "#839496",
					"panel.background": "#073642",
					"terminal.background": "#002b36",
					"terminal.foreground": "#839496",
					"terminal.ansi.black": "#073642",
					"terminal.ansi.red": "#dc322f",
					"terminal.ansi.green": "#859900",
					"terminal.ansi.yellow": "#b58900",
					"terminal.ansi.blue": "#268bd2",
					"terminal.ansi.magenta": "#d33682",
					"terminal.ansi.cyan": "#2aa198",
					"terminal.ansi.white": "#eee8d5",
					"terminal.ansi.bright_black": "#586e75",
					"terminal.ansi.bright_red": "#cb4b16",
					"terminal.ansi.bright_green": "#586e75",
					"terminal.ansi.bright_yellow": "#657b83",
					"terminal.ansi.bright_blue": "#839496",
					"terminal.ansi.bright_magenta": "#6c71c4",
					"terminal.ansi.bright_cyan": "#93a1a1",
					"terminal.ansi.bright_white": "#fdf6e3",
				},
			},
			{
				name: "Solarized Light",
				appearance: "light",
				style: {
					background: "#fdf6e3",
					text: "#657b83",
					"text.muted": "#93a1a1",
					border: "#eee8d5",
					"surface.background": "#eee8d5",
					"elevated_surface.background": "#e8e1cd",
					"element.background": "#e8e1cd",
					"element.selected": "#ddd6c1",
					"element.active": "#ddd6c1",
					"text.accent": "#268bd2",
					error: "#dc322f",
					"editor.background": "#fdf6e3",
					"editor.foreground": "#657b83",
					"panel.background": "#eee8d5",
					"terminal.background": "#fdf6e3",
					"terminal.foreground": "#657b83",
					"terminal.ansi.black": "#073642",
					"terminal.ansi.red": "#dc322f",
					"terminal.ansi.green": "#859900",
					"terminal.ansi.yellow": "#b58900",
					"terminal.ansi.blue": "#268bd2",
					"terminal.ansi.magenta": "#d33682",
					"terminal.ansi.cyan": "#2aa198",
					"terminal.ansi.white": "#eee8d5",
					"terminal.ansi.bright_black": "#002b36",
					"terminal.ansi.bright_red": "#cb4b16",
					"terminal.ansi.bright_green": "#586e75",
					"terminal.ansi.bright_yellow": "#657b83",
					"terminal.ansi.bright_blue": "#839496",
					"terminal.ansi.bright_magenta": "#6c71c4",
					"terminal.ansi.bright_cyan": "#93a1a1",
					"terminal.ansi.bright_white": "#fdf6e3",
				},
			},
		],
	},
];

/** Recursively collect files under `dir` whose name matches `predicate`. */
function walkFiles(
	dir: string,
	predicate: (name: string) => boolean,
): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		let isDir = false;
		try {
			isDir = statSync(full).isDirectory();
		} catch {
			continue;
		}
		if (isDir) {
			out.push(...walkFiles(full, predicate));
		} else if (predicate(entry)) {
			out.push(full);
		}
	}
	return out;
}

function loadZedFamiliesFromDir(dir: string): ZedThemeFamily[] {
	const families: ZedThemeFamily[] = [];
	for (const file of walkFiles(dir, (name) => name.endsWith(".json"))) {
		try {
			const parsed = JSON.parse(readFileSync(file, "utf8")) as ZedThemeFamily;
			if (Array.isArray(parsed.themes)) {
				families.push(parsed);
			}
		} catch (error) {
			console.warn(`[convert-zed-themes] Skipping ${file}: ${String(error)}`);
		}
	}
	return families;
}

/**
 * Minimal parser for the flat tinted-theming scheme YAML files. They only use
 * `key: value` scalars and a single nested `palette:` block (two-space indent),
 * so a full YAML dependency is unnecessary. Palette keys are lowercased to match
 * {@link base16ToZedFamily}'s expectations.
 */
function parseSchemeYaml(raw: string): Base16Scheme | null {
	const top: Record<string, string> = {};
	const palette: Record<string, string> = {};
	let inPalette = false;

	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim() || line.trim().startsWith("#")) {
			continue;
		}
		const indented = /^\s+/.test(line);
		const match = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*?)\s*$/);
		if (!match) {
			continue;
		}
		const key = match[1];
		// Strip inline comments and surrounding quotes from the value.
		const value = match[2]
			.replace(/\s+#.*$/, "")
			.trim()
			.replace(/^["']|["']$/g, "");

		if (key === "palette" && !indented) {
			inPalette = true;
			continue;
		}
		if (inPalette && indented) {
			if (value) {
				palette[key.toLowerCase()] = value;
			}
			continue;
		}
		inPalette = false;
		top[key] = value;
	}

	if (!top.name || Object.keys(palette).length === 0) {
		return null;
	}
	const system: Base16System = top.system === "base24" ? "base24" : "base16";
	return {
		system,
		name: top.name,
		author: top.author || undefined,
		variant: top.variant === "light" ? "light" : "dark",
		palette,
	};
}

function loadSchemeFamiliesFromDir(dir: string): ZedThemeFamily[] {
	const families: ZedThemeFamily[] = [];
	const files = walkFiles(
		dir,
		(name) => name.endsWith(".yaml") || name.endsWith(".yml"),
	);
	for (const file of files) {
		try {
			const scheme = parseSchemeYaml(readFileSync(file, "utf8"));
			if (scheme) {
				families.push(base16ToZedFamily(scheme));
			}
		} catch (error) {
			console.warn(`[convert-zed-themes] Skipping ${file}: ${String(error)}`);
		}
	}
	return families;
}

function parseSchemesArg(argv: string[]): string | undefined {
	const flagIndex = argv.indexOf("--schemes");
	if (flagIndex !== -1 && argv[flagIndex + 1]) {
		return argv[flagIndex + 1];
	}
	const inline = argv.find((arg) => arg.startsWith("--schemes="));
	if (inline) {
		return inline.slice("--schemes=".length);
	}
	return process.env.ZED_BASE16_SCHEMES_DIR;
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const schemesDir = parseSchemesArg(argv);
	// The lone positional (if any) is the optional upstream Zed themes dir; skip
	// flags and the value consumed by `--schemes`.
	const schemesFlagIndex = argv.indexOf("--schemes");
	const schemesValueIndex = schemesFlagIndex === -1 ? -1 : schemesFlagIndex + 1;
	const zedDir = argv.find(
		(arg, index) => !arg.startsWith("--") && index !== schemesValueIndex,
	);

	// Priority order: embedded curated families first (hand-tuned), then any
	// upstream Zed dir, then the large base16/base24 scheme collection. The first
	// family to claim an id wins, so curated themes take precedence over their
	// base16 namesakes.
	const families: ZedThemeFamily[] = [...EMBEDDED_FAMILIES];

	if (zedDir && existsSync(zedDir)) {
		families.push(...loadZedFamiliesFromDir(zedDir));
	}
	if (schemesDir && existsSync(schemesDir)) {
		families.push(...loadSchemeFamiliesFromDir(schemesDir));
	} else if (schemesDir) {
		console.warn(`[convert-zed-themes] Schemes dir not found: ${schemesDir}`);
	}

	if (!zedDir && !schemesDir) {
		console.log(
			"[convert-zed-themes] No input dir given — using embedded sample only. " +
				"Pass --schemes <tinted-theming/schemes checkout> to build the full library.",
		);
	}

	// Convert and globally de-dupe by id (first family wins).
	const byId = new Map<string, ReturnType<typeof convertZedFamily>[number]>();
	for (const family of families) {
		for (const theme of convertZedFamily(family)) {
			if (!byId.has(theme.id)) {
				byId.set(theme.id, theme);
			}
		}
	}

	const themes = Array.from(byId.values()).sort((a, b) =>
		a.name.localeCompare(b.name),
	);

	await mkdir(dirname(OUT_PATH), { recursive: true });
	await writeFile(OUT_PATH, `${JSON.stringify(themes, null, "\t")}\n`, "utf8");
	console.log(
		`[convert-zed-themes] Wrote ${themes.length} themes → ${OUT_PATH}`,
	);
}

void main();
