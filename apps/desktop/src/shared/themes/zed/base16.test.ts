import { describe, expect, test } from "bun:test";
import { RESERVED_THEME_IDS } from "../import";
import {
	type Base16Scheme,
	base16ToZedFamily,
	base16ToZedStyle,
} from "./base16";
import { convertZedFamily } from "./convert";

const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

// A real base16 scheme (tinted-theming "Dracula").
const DRACULA: Base16Scheme = {
	system: "base16",
	name: "Dracula",
	author: "clach04",
	variant: "dark",
	palette: {
		base00: "#282a36",
		base01: "#21222c",
		base02: "#44475a",
		base03: "#6272a4",
		base04: "#9ea8c7",
		base05: "#f8f8f2",
		base06: "#f8f8f2",
		base07: "#ffffff",
		base08: "#ff5555",
		base09: "#ffb86c",
		base0a: "#f1fa8c",
		base0b: "#50fa7b",
		base0c: "#8be9fd",
		base0d: "#bd93f9",
		base0e: "#ff79c6",
		base0f: "#993333",
	},
};

describe("base16ToZedStyle", () => {
	test("maps base16 slots onto the Zed style keys", () => {
		const style = base16ToZedStyle(DRACULA);
		expect(style.background).toBe("#282a36");
		expect(style.text).toBe("#f8f8f2");
		expect(style["text.accent"]).toBe("#bd93f9");
		expect(style["terminal.ansi.red"]).toBe("#ff5555");
		expect(style["terminal.ansi.green"]).toBe("#50fa7b");
		expect(style["terminal.ansi.bright_black"]).toBe("#6272a4");
		expect(style["terminal.ansi.bright_white"]).toBe("#ffffff");
	});

	test("uses base24 bright slots when system is base24", () => {
		const base24: Base16Scheme = {
			...DRACULA,
			system: "base24",
			palette: {
				...DRACULA.palette,
				base12: "#ff8888",
				base14: "#88ff88",
			},
		};
		const style = base16ToZedStyle(base24);
		expect(style["terminal.ansi.bright_red"]).toBe("#ff8888");
		expect(style["terminal.ansi.bright_green"]).toBe("#88ff88");
	});
});

describe("base16ToZedFamily → convertZedFamily round-trip", () => {
	test("produces one valid, non-reserved library theme", () => {
		const themes = convertZedFamily(base16ToZedFamily(DRACULA));
		expect(themes).toHaveLength(1);
		const theme = themes[0];

		expect(theme.id).toBe("dracula");
		expect(RESERVED_THEME_IDS.has(theme.id)).toBe(false);
		expect(theme.type).toBe("dark");
		expect(theme.isLibrary).toBe(true);
		expect(theme.author).toBe("clach04");

		expect(theme.ui.background).toMatch(HEX);
		expect(theme.ui.foreground).toMatch(HEX);
		expect(theme.ui.primary).toBe("#bd93f9");
		expect(theme.terminal?.red).toBe("#ff5555");
		expect(theme.terminal?.blue).toBe("#bd93f9");
	});

	test("accepts uppercase base0A-style palette keys", () => {
		const upper: Base16Scheme = {
			...DRACULA,
			palette: { base00: "#101010", base05: "#fafafa", base0D: "#3366ff" },
		};
		const style = base16ToZedStyle(upper);
		expect(style["text.accent"]).toBe("#3366ff");
	});
});
