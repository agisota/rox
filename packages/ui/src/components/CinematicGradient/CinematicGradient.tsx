"use client";

/**
 * CinematicGradient — turns a flat 4-color mesh gradient into a cinematic scene
 * (custom-loading-screens epic). It layers, over the animated base mesh:
 *
 *   1. scene light (aurora / nebula / dunes / horizon / calm — see `scenes.tsx`)
 *   2. film grain (overlay blend) to break banding and add a photographic feel
 *   3. a vignette that darkens (dark tone) or lifts (light tone) the edges
 *
 * Everything is zero-asset and offline: no images, no network, no installer
 * weight. Motion is transform/opacity only and fully disabled under
 * `prefers-reduced-motion`. Pure and presentational — callers own when it
 * mounts and which palette/scene it shows.
 */

import type { WallpaperScene } from "@rox/shared/appearance";
import { useReducedMotion } from "motion/react";
import { type CSSProperties, useEffect } from "react";
import { cn } from "../../lib/utils";
import { MeshGradient } from "../mesh-gradient";
import { ensureCinematicStyles, GRAIN_DATA_URI } from "./keyframes";
import { SceneLayers } from "./scenes";

interface CinematicGradientProps {
	/** Base mesh palette, darkest → brightest is not required but reads best. */
	colors: readonly [string, string, string, string];
	/** Cinematic atmosphere layered over the mesh. Defaults to `"calm"`. */
	scene?: WallpaperScene;
	/** Dominant tone — drives vignette direction and grain strength. */
	tone?: "dark" | "light";
	className?: string;
}

/** A cinematic, animated background built from a palette + scene. */
export function CinematicGradient({
	colors,
	scene = "calm",
	tone = "dark",
	className,
}: CinematicGradientProps) {
	const reduceMotion = useReducedMotion();
	const animate = !reduceMotion;

	useEffect(() => {
		ensureCinematicStyles();
	}, []);

	const paletteVars = {
		"--cine-1": colors[0],
		"--cine-2": colors[1],
		"--cine-3": colors[2],
		"--cine-4": colors[3],
	} as CSSProperties;

	// Dark scenes deepen at the edges; light scenes bloom outward instead.
	const vignette =
		tone === "light"
			? "radial-gradient(ellipse at center, transparent 55%, rgba(255,255,255,0.35) 100%)"
			: "radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.55) 100%)";

	return (
		<div
			className={cn("relative h-full w-full overflow-hidden", className)}
			style={paletteVars}
		>
			{/* 1. Base animated mesh. */}
			<MeshGradient colors={colors} className="absolute inset-0" />

			{/* 2. Scene light. */}
			<div className="absolute inset-0">
				<SceneLayers scene={scene} animate={animate} />
			</div>

			{/* 3. Film grain. */}
			<div
				className="absolute inset-0"
				style={{
					backgroundImage: GRAIN_DATA_URI,
					backgroundRepeat: "repeat",
					mixBlendMode: "overlay",
					opacity: tone === "light" ? 0.12 : 0.18,
				}}
			/>

			{/* 4. Vignette. */}
			<div className="absolute inset-0" style={{ background: vignette }} />
		</div>
	);
}
