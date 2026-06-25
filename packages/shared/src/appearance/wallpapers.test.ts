import { describe, expect, it } from "bun:test";
import { getWallpaper, WALLPAPERS } from "./wallpapers";

/**
 * FN-047 (#489): theme backgrounds must offer real photo IMAGES, not only color
 * gradients. These tests pin that the curated pack ships image-source wallpapers
 * and that every entry stays well-formed and consumable cross-platform.
 */
describe("WALLPAPERS image themes (FN-047)", () => {
	const imageWallpapers = WALLPAPERS.filter(
		(w) => w.source.kind === "remote" || w.source.kind === "bundled",
	);

	it("includes at least a handful of photo (image) wallpapers", () => {
		expect(imageWallpapers.length).toBeGreaterThanOrEqual(5);
	});

	it("every image wallpaper has a non-empty, well-formed source url/path", () => {
		for (const w of imageWallpapers) {
			if (w.source.kind === "remote") {
				expect(w.source.url.length).toBeGreaterThan(0);
				expect(w.source.url.startsWith("https://")).toBe(true);
			} else if (w.source.kind === "bundled") {
				expect(w.source.path.length).toBeGreaterThan(0);
			}
		}
	});

	it("every image wallpaper exposes a smaller thumb for the settings grid", () => {
		for (const w of imageWallpapers) {
			expect(w.thumb).toBeDefined();
			expect(w.thumb?.kind === "remote" || w.thumb?.kind === "bundled").toBe(
				true,
			);
		}
	});

	it("offers both dark and light tones so the foreground stays legible", () => {
		const tones = new Set(imageWallpapers.map((w) => w.tone));
		expect(tones.has("dark")).toBe(true);
		expect(tones.has("light")).toBe(true);
	});
});

describe("WALLPAPERS manifest integrity", () => {
	it("has unique ids", () => {
		const ids = WALLPAPERS.map((w) => w.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("getWallpaper resolves a known image theme and ignores unknown/null", () => {
		expect(getWallpaper("photo-mountain-lake")?.id).toBe("photo-mountain-lake");
		expect(getWallpaper("does-not-exist")).toBeUndefined();
		expect(getWallpaper(null)).toBeUndefined();
	});
});
