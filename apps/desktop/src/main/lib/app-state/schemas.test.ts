import { describe, expect, it } from "bun:test";
import { DEFAULT_THEME_ID } from "shared/themes";
import { defaultAppState } from "./schemas";

describe("defaultAppState", () => {
	it("starts with the dark built-in theme selected", () => {
		expect(defaultAppState.themeState.activeThemeId).toBe(DEFAULT_THEME_ID);
		expect(defaultAppState.themeState.systemDarkThemeId).toBe("dark");
		expect(defaultAppState.themeState.systemLightThemeId).toBe("light");
	});

	it("starts with glass enabled, 60 percent opacity, and the dawn-mist wallpaper", () => {
		expect(defaultAppState.appearanceState).toEqual({
			glassEnabled: true,
			windowOpacity: 0.6,
			wallpaperId: "dawn-mist",
			wallpaperAutoRotate: false,
			wallpaperRotateSeconds: 120,
			quoteLoaderEnabled: true,
		});
	});
});
