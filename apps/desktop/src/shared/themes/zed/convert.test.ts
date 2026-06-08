import { describe, expect, test } from "bun:test";
import { RESERVED_THEME_IDS } from "../import";
import {
	convertZedFamily,
	convertZedTheme,
	type ZedThemeFamily,
} from "./convert";
import { getLibraryTheme, getLibraryThemes } from "./index";

const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

const ONE_DARK_FAMILY: ZedThemeFamily = {
	name: "One",
	author: "Zed Industries",
	themes: [
		{
			name: "One Dark",
			appearance: "dark",
			style: {
				background: "#282c33",
				text: "#dce0e5",
				border: "#464b57",
				"text.accent": "#74ade8",
				"editor.background": "#282c33",
				"editor.foreground": "#dce0e5",
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
			},
		},
	],
};

describe("convertZedTheme", () => {
	test("round-trips a known Zed theme into a Rox theme", () => {
		const theme = convertZedTheme(ONE_DARK_FAMILY.themes[0], {
			author: "Zed Industries",
		});
		expect(theme).toBeDefined();
		if (!theme) return;

		expect(theme.id).toBe("one-dark");
		expect(theme.name).toBe("One Dark");
		expect(theme.type).toBe("dark");
		expect(theme.isLibrary).toBe(true);
		expect(theme.author).toBe("Zed Industries");

		// Colors pulled straight from the Zed style map.
		expect(theme.ui.background).toBe("#282c33");
		expect(theme.ui.foreground).toBe("#dce0e5");
		expect(theme.ui.primary).toBe("#74ade8");
		expect(theme.terminal?.red).toBe("#d07277");
		expect(theme.terminal?.blue).toBe("#74ade8");
	});

	test("maps light appearance to a light Rox theme", () => {
		const theme = convertZedTheme({
			name: "Solarized Light",
			appearance: "light",
			style: { background: "#fdf6e3", text: "#657b83" },
		});
		expect(theme?.type).toBe("light");
	});

	test("returns undefined for reserved ids", () => {
		// "dark" and "light" are reserved (built-in ids).
		for (const reserved of ["Dark", "Light", "System"]) {
			const theme = convertZedTheme({
				name: reserved,
				appearance: "dark",
				style: { background: "#000000" },
			});
			expect(theme).toBeUndefined();
		}
	});
});

describe("convertZedFamily", () => {
	test("converts every non-reserved variant and de-dupes by id", () => {
		const family: ZedThemeFamily = {
			name: "Dup",
			themes: [
				{ name: "Twin", appearance: "dark", style: { background: "#111111" } },
				{ name: "Twin", appearance: "dark", style: { background: "#222222" } },
				{ name: "Dark", appearance: "dark", style: { background: "#000000" } },
			],
		};
		const themes = convertZedFamily(family);
		expect(themes).toHaveLength(1);
		expect(themes[0].id).toBe("twin");
	});
});

describe("library dataset", () => {
	test("loads, every id is unique, non-reserved, and colors are valid hex", () => {
		const themes = getLibraryThemes();
		expect(themes.length).toBeGreaterThan(0);

		const ids = new Set<string>();
		for (const theme of themes) {
			expect(theme.isLibrary).toBe(true);
			expect(RESERVED_THEME_IDS.has(theme.id)).toBe(false);
			expect(ids.has(theme.id)).toBe(false);
			ids.add(theme.id);

			expect(theme.ui.background).toMatch(HEX);
			expect(theme.ui.foreground).toMatch(HEX);
			expect(theme.terminal?.red).toMatch(HEX);
		}
	});

	test("getLibraryTheme resolves a known id", () => {
		const first = getLibraryThemes()[0];
		expect(getLibraryTheme(first.id)).toEqual(first);
		expect(getLibraryTheme("definitely-not-a-real-theme")).toBeUndefined();
	});
});
