#!/usr/bin/env bun
/**
 * Generate the bundled Zed theme library dataset.
 *
 * Reads Zed theme family JSON files and converts them into Rox `Theme` objects
 * via {@link convertZedFamily}, writing the result to
 * `src/shared/themes/zed/generated/zed-themes.json`.
 *
 * Usage:
 *   bun run apps/desktop/scripts/convert-zed-themes.ts [zedThemesDir]
 *
 * When `zedThemesDir` is provided it should point at a checkout of
 * `zed-industries/zed/assets/themes` (each `*.json` is one family). When it is
 * omitted, a small embedded sample of canonical Zed families is used so the
 * dataset is reproducible without a network/clone step. Replace the embedded
 * sample (or pass the upstream dir) to regenerate the full ~500-theme library.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
];

function loadFamiliesFromDir(dir: string): ZedThemeFamily[] {
	const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
	const families: ZedThemeFamily[] = [];
	for (const file of files) {
		try {
			const raw = readFileSync(join(dir, file), "utf8");
			const parsed = JSON.parse(raw) as ZedThemeFamily;
			if (Array.isArray(parsed.themes)) {
				families.push(parsed);
			}
		} catch (error) {
			console.warn(`[convert-zed-themes] Skipping ${file}: ${String(error)}`);
		}
	}
	return families;
}

async function main(): Promise<void> {
	const inputDir = process.argv[2];
	const families =
		inputDir && existsSync(inputDir)
			? loadFamiliesFromDir(inputDir)
			: EMBEDDED_FAMILIES;

	if (!inputDir) {
		console.log(
			"[convert-zed-themes] No input dir given — using embedded sample. " +
				"Pass a path to zed-industries/zed/assets/themes to regenerate the full library.",
		);
	}

	const themes = families.flatMap((family) => convertZedFamily(family));
	themes.sort((a, b) => a.name.localeCompare(b.name));

	await mkdir(dirname(OUT_PATH), { recursive: true });
	await writeFile(OUT_PATH, `${JSON.stringify(themes, null, "\t")}\n`, "utf8");
	console.log(
		`[convert-zed-themes] Wrote ${themes.length} themes → ${OUT_PATH}`,
	);
}

void main();
