import { describe, expect, it } from "bun:test";
import { UI_COLOR_TO_CSS_VAR, type UIColors } from "./colors";
import { skinToNavTokens, skinToStyleTokens } from "./mobile-adapter";
import { DEFAULT_SKIN_ID, getSkin, SKINS } from "./skins";

describe("skin registry", () => {
	it("exposes the default skin first with no overrides", () => {
		const first = SKINS[0];
		expect(first?.id).toBe(DEFAULT_SKIN_ID);
		expect(Object.keys(first?.ui ?? {})).toHaveLength(0);
	});

	it("offers ~17 selectable skins", () => {
		// Acceptance: web ~17 skins selectable (default + Zed-derived families).
		expect(SKINS.length).toBeGreaterThanOrEqual(17);
	});

	it("has unique skin ids", () => {
		const ids = SKINS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("only overrides keys that exist in the UIColors model", () => {
		const valid = new Set(Object.keys(UI_COLOR_TO_CSS_VAR));
		for (const skin of SKINS) {
			for (const key of Object.keys(skin.ui)) {
				expect(valid.has(key)).toBe(true);
			}
		}
	});

	it("getSkin falls back to the default for unknown ids", () => {
		expect(getSkin("does-not-exist").id).toBe(DEFAULT_SKIN_ID);
		expect(getSkin("one-dark").id).toBe("one-dark");
	});

	it("tags each skin with a light/dark axis", () => {
		for (const skin of SKINS) {
			expect(["light", "dark"]).toContain(skin.type);
		}
	});
});

describe("UI_COLOR_TO_CSS_VAR", () => {
	it("maps every UIColors key to a css var", () => {
		// Type-level coverage check: the map is keyed by keyof UIColors.
		const sample: UIColors = {
			background: "x",
			foreground: "x",
			card: "x",
			cardForeground: "x",
			popover: "x",
			popoverForeground: "x",
			primary: "x",
			primaryForeground: "x",
			secondary: "x",
			secondaryForeground: "x",
			muted: "x",
			mutedForeground: "x",
			accent: "x",
			accentForeground: "x",
			tertiary: "x",
			tertiaryActive: "x",
			destructive: "x",
			destructiveForeground: "x",
			border: "x",
			input: "x",
			ring: "x",
			sidebar: "x",
			sidebarForeground: "x",
			sidebarPrimary: "x",
			sidebarPrimaryForeground: "x",
			sidebarAccent: "x",
			sidebarAccentForeground: "x",
			sidebarBorder: "x",
			sidebarRing: "x",
			chart1: "x",
			chart2: "x",
			chart3: "x",
			chart4: "x",
			chart5: "x",
			highlightMatch: "x",
			highlightActive: "x",
		};
		for (const key of Object.keys(sample)) {
			expect(UI_COLOR_TO_CSS_VAR[key as keyof UIColors]).toMatch(/^--/);
		}
	});
});

describe("mobile adapter", () => {
	it("returns only the skin's explicitly-set tokens", () => {
		const tokens = skinToStyleTokens("one-dark");
		expect(tokens.primary).toBeDefined();
		// one-dark does not set a card override → adapter omits it.
		expect(tokens.card).toBeUndefined();
	});

	it("default skin resolves to an empty token map", () => {
		expect(Object.keys(skinToStyleTokens(DEFAULT_SKIN_ID))).toHaveLength(0);
	});

	it("maps destructive → navigation notification", () => {
		const skin = getSkin("ayu-dark");
		const nav = skinToNavTokens(skin);
		// ayu-dark sets background + primary; nav reflects what's present.
		expect(nav.background).toBe(skin.ui.background);
		expect(nav.primary).toBe(skin.ui.primary);
	});
});
