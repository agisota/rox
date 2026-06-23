/**
 * Curated wallpaper pack (custom-loading-screens epic).
 *
 * Ships zero-asset `gradient` wallpapers so the feature works offline and adds
 * no installer weight. Each gradient carries a cinematic `scene` (aurora /
 * nebula / dunes / horizon / calm) that the renderer layers over the base mesh
 * with drifting light, film grain, and a vignette — turning flat gradients into
 * cinematic scenes without any binary assets. Image wallpapers (`bundled` /
 * `remote`) are added when a licensed photo pack is finalized; the manifest
 * shape already supports them, so consumers won't change.
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
		scene: "aurora",
	},
	{
		id: "ember-dusk",
		name: "Ember Dusk",
		source: {
			kind: "gradient",
			colors: ["#1a0d08", "#3a1d0e", "#a8430f", "#1a0d08"],
		},
		tone: "dark",
		scene: "horizon",
	},
	{
		id: "deep-forest",
		name: "Deep Forest",
		source: {
			kind: "gradient",
			colors: ["#07120c", "#0e2a1c", "#2f6f4a", "#07120c"],
		},
		tone: "dark",
		scene: "aurora",
	},
	{
		id: "violet-haze",
		name: "Violet Haze",
		source: {
			kind: "gradient",
			colors: ["#120a1f", "#2a1450", "#7a3fb0", "#120a1f"],
		},
		tone: "dark",
		scene: "nebula",
	},
	{
		id: "slate-calm",
		name: "Slate Calm",
		source: {
			kind: "gradient",
			colors: ["#0c0f14", "#1b2230", "#3a4a63", "#0c0f14"],
		},
		tone: "dark",
		scene: "calm",
	},
	{
		id: "dawn-mist",
		name: "Dawn Mist",
		source: {
			kind: "gradient",
			colors: ["#eef3fb", "#d8e6f7", "#bcd3ef", "#eef3fb"],
		},
		tone: "light",
		scene: "horizon",
	},
	{
		id: "warm-linen",
		name: "Warm Linen",
		source: {
			kind: "gradient",
			colors: ["#f7f2ea", "#efe4d3", "#e3d2b8", "#f7f2ea"],
		},
		tone: "light",
		scene: "dunes",
	},
	// ── Expanded gradient pack: brighter, more saturated "flying" scenes ──
	{
		id: "rose-quartz",
		name: "Rose Quartz",
		source: {
			kind: "gradient",
			colors: ["#fdeef2", "#fbd5e0", "#f3a8c4", "#fdeef2"],
		},
		tone: "light",
		scene: "horizon",
	},
	{
		id: "spring-meadow",
		name: "Spring Meadow",
		source: {
			kind: "gradient",
			colors: ["#f0fbf2", "#cdeedd", "#9fdcc0", "#f0fbf2"],
		},
		tone: "light",
		scene: "aurora",
	},
	{
		id: "peach-sorbet",
		name: "Peach Sorbet",
		source: {
			kind: "gradient",
			colors: ["#fff4ec", "#ffe0cc", "#ffc09f", "#fff4ec"],
		},
		tone: "light",
		scene: "dunes",
	},
	{
		id: "lavender-sky",
		name: "Lavender Sky",
		source: {
			kind: "gradient",
			colors: ["#f4f0ff", "#e3d9ff", "#c4b0f7", "#f4f0ff"],
		},
		tone: "light",
		scene: "nebula",
	},
	{
		id: "arctic-mint",
		name: "Arctic Mint",
		source: {
			kind: "gradient",
			colors: ["#eefbfb", "#cdeef0", "#9fdde2", "#eefbfb"],
		},
		tone: "light",
		scene: "calm",
	},
	{
		id: "citrus-haze",
		name: "Citrus Haze",
		source: {
			kind: "gradient",
			colors: ["#fffbe8", "#fdf0b8", "#f6d35a", "#fffbe8"],
		},
		tone: "light",
		scene: "horizon",
	},
	{
		id: "cosmic-magenta",
		name: "Cosmic Magenta",
		source: {
			kind: "gradient",
			colors: ["#1a0820", "#4a0f57", "#c026a3", "#1a0820"],
		},
		tone: "dark",
		scene: "nebula",
	},
	{
		id: "electric-tide",
		name: "Electric Tide",
		source: {
			kind: "gradient",
			colors: ["#04121f", "#0a2f57", "#1f8fd6", "#04121f"],
		},
		tone: "dark",
		scene: "aurora",
	},
	{
		id: "sunset-coral",
		name: "Sunset Coral",
		source: {
			kind: "gradient",
			colors: ["#1c0a10", "#5a142a", "#ff5c5c", "#1c0a10"],
		},
		tone: "dark",
		scene: "horizon",
	},
	{
		id: "emerald-night",
		name: "Emerald Night",
		source: {
			kind: "gradient",
			colors: ["#04140f", "#0a3a2a", "#15c08a", "#04140f"],
		},
		tone: "dark",
		scene: "aurora",
	},
	// ── Looping video background (Apple-TV-aerial style) ──────────────────────
	// Demo entry proving the `video` source works end-to-end. Replace `src` with
	// a licensed/self-hosted seamless aerial loop (see appearance/README.md).
	// Reduced-motion users get the paused first frame (or `poster` if provided).
	{
		id: "aerial-demo-loop",
		name: "Видео-петля · демо",
		source: {
			kind: "video",
			src: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_2MB.mp4",
		},
		tone: "dark",
	},
];

/** Look up a wallpaper by id, or undefined if it is not in the pack. */
export function getWallpaper(id: string | null): Wallpaper | undefined {
	if (id === null) return undefined;
	return WALLPAPERS.find((w) => w.id === id);
}
