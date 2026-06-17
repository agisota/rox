/**
 * Curated wallpaper pack (custom-loading-screens epic).
 *
 * Slice 1 ships zero-asset `gradient` wallpapers so the feature works offline
 * and adds no installer weight. Cinematic image wallpapers (`bundled` /
 * `remote`) are added when the content pack is finalized — the manifest shape
 * already supports them, so consumers won't change.
 */

import type { Wallpaper } from "./types";

export const WALLPAPERS: readonly Wallpaper[] = [
	{
		id: "midnight-aurora",
		name: "Midnight Aurora",
		source: {
			kind: "gradient",
			colors: ["#0b1026", "#13294b", "#1f6f6f", "#0b1026"],
		},
		tone: "dark",
	},
	{
		id: "ember-dusk",
		name: "Ember Dusk",
		source: {
			kind: "gradient",
			colors: ["#1a0d08", "#3a1d0e", "#a8430f", "#1a0d08"],
		},
		tone: "dark",
	},
	{
		id: "deep-forest",
		name: "Deep Forest",
		source: {
			kind: "gradient",
			colors: ["#07120c", "#0e2a1c", "#2f6f4a", "#07120c"],
		},
		tone: "dark",
	},
	{
		id: "violet-haze",
		name: "Violet Haze",
		source: {
			kind: "gradient",
			colors: ["#120a1f", "#2a1450", "#7a3fb0", "#120a1f"],
		},
		tone: "dark",
	},
	{
		id: "slate-calm",
		name: "Slate Calm",
		source: {
			kind: "gradient",
			colors: ["#0c0f14", "#1b2230", "#3a4a63", "#0c0f14"],
		},
		tone: "dark",
	},
	{
		id: "dawn-mist",
		name: "Dawn Mist",
		source: {
			kind: "gradient",
			colors: ["#eef3fb", "#d8e6f7", "#bcd3ef", "#eef3fb"],
		},
		tone: "light",
	},
	{
		id: "warm-linen",
		name: "Warm Linen",
		source: {
			kind: "gradient",
			colors: ["#f7f2ea", "#efe4d3", "#e3d2b8", "#f7f2ea"],
		},
		tone: "light",
	},
];

/** Look up a wallpaper by id, or undefined if it is not in the pack. */
export function getWallpaper(id: string | null): Wallpaper | undefined {
	if (id === null) return undefined;
	return WALLPAPERS.find((w) => w.id === id);
}
