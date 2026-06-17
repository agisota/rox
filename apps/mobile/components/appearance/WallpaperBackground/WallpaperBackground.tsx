import type { Wallpaper } from "@rox/shared/appearance";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/**
 * Solid-color fallback used when a wallpaper cannot be rendered as a gradient
 * (e.g. a future `bundled`/`remote` source the RN layer does not yet load).
 * Degrades gracefully to the first available color instead of a blank screen.
 */
function firstColor(wallpaper: Wallpaper): string {
	const { source } = wallpaper;
	if (source.kind === "gradient") return source.colors[0];
	return "#000000";
}

/** Renders a single wallpaper as a full-bleed layer (gradient or solid fallback). */
function WallpaperFill({ wallpaper }: { wallpaper: Wallpaper }) {
	const { source } = wallpaper;
	if (source.kind !== "gradient") {
		// No RN asset loader wired yet for bundled/remote sources — fall back to a
		// solid fill so the background still reads as intentional.
		return (
			<View
				style={[
					StyleSheet.absoluteFill,
					{ backgroundColor: firstColor(wallpaper) },
				]}
			/>
		);
	}

	const [c0, c1, c2, c3] = source.colors;
	return (
		<Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
			<Defs>
				<LinearGradient id="wallpaper" x1="0" y1="0" x2="1" y2="1">
					<Stop offset="0" stopColor={c0} />
					<Stop offset="0.4" stopColor={c1} />
					<Stop offset="0.7" stopColor={c2} />
					<Stop offset="1" stopColor={c3} />
				</LinearGradient>
			</Defs>
			<Rect x="0" y="0" width="100%" height="100%" fill="url(#wallpaper)" />
		</Svg>
	);
}

/**
 * Full-screen wallpaper background.
 *
 * Renders the given {@link Wallpaper} as a 4-stop linear gradient (mapping our
 * 4 wallpaper colors across the diagonal). When `wallpaper` changes, the new
 * layer crossfades in over the previous one via `react-native-reanimated`
 * `FadeIn`/`FadeOut`. This component owns no rotation timer — the active
 * wallpaper is selected upstream (see `AppearanceProvider`).
 *
 * Returns `null` when there is no wallpaper, so callers can mount it
 * unconditionally as the first child of a screen.
 */
export function WallpaperBackground({
	wallpaper,
}: {
	wallpaper: Wallpaper | null;
}) {
	// Track the previous wallpaper so we can crossfade out the old layer while the
	// new one fades in. `keyedWallpaper.key` forces Animated remounts on change.
	const previousRef = useRef<Wallpaper | null>(null);
	const [layers, setLayers] = useState<Wallpaper[]>(
		wallpaper ? [wallpaper] : [],
	);

	useEffect(() => {
		const previous = previousRef.current;
		previousRef.current = wallpaper;
		if (previous?.id === wallpaper?.id) return;
		setLayers(wallpaper ? [wallpaper] : []);
	}, [wallpaper]);

	if (layers.length === 0) return null;

	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="none">
			{layers.map((layer) => (
				<Animated.View
					key={layer.id}
					style={StyleSheet.absoluteFill}
					entering={FadeIn.duration(600)}
					exiting={FadeOut.duration(600)}
				>
					<WallpaperFill wallpaper={layer} />
				</Animated.View>
			))}
		</View>
	);
}
