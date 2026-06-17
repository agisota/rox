"use client";

/**
 * Scene layers for {@link CinematicGradient} (custom-loading-screens epic).
 *
 * Each scene returns a stack of absolutely-positioned, blurred light layers
 * rendered over the base mesh gradient. Layers animate via the shared keyframes
 * injected by the parent (see `keyframes.ts`) and read the wallpaper palette
 * from CSS custom properties (`--cine-1`…`--cine-4`) set on the container, so a
 * single scene works for every palette. All motion is transform/opacity only,
 * and the parent passes `animate={false}` for reduced-motion or static previews.
 */

import type { WallpaperScene } from "@rox/shared/appearance";
import type { CSSProperties } from "react";

/** Shared base style for a soft, blurred light blob. */
function blob(style: CSSProperties): CSSProperties {
	return {
		position: "absolute",
		borderRadius: "9999px",
		filter: "blur(60px)",
		willChange: "transform, opacity",
		...style,
	};
}

/** Duration multiplier so layers drift at slightly different, non-looping rates. */
const SLOW = "38s";
const MED = "26s";
const FAST = "18s";

interface SceneLayersProps {
	scene: WallpaperScene;
	/** When false (reduced motion / static preview), layers hold their pose. */
	animate: boolean;
}

/** Apply an animation only when motion is enabled. */
function anim(animate: boolean, value: string): string | undefined {
	return animate ? value : undefined;
}

/** Renders the scene-specific light layers (excludes grain/vignette). */
export function SceneLayers({ scene, animate }: SceneLayersProps) {
	switch (scene) {
		case "aurora":
			return (
				<>
					<div
						style={blob({
							inset: "-20% -10% auto -10%",
							height: "75%",
							background:
								"linear-gradient(115deg, transparent 0%, var(--cine-3) 45%, var(--cine-4) 70%, transparent 100%)",
							opacity: 0.55,
							mixBlendMode: "screen",
							filter: "blur(80px)",
							animation: anim(
								animate,
								`rox-cine-sway ${SLOW} ease-in-out infinite`,
							),
						})}
					/>
					<div
						style={blob({
							inset: "10% -20% auto 20%",
							height: "60%",
							width: "70%",
							background:
								"linear-gradient(160deg, transparent 0%, var(--cine-4) 50%, transparent 100%)",
							opacity: 0.4,
							mixBlendMode: "screen",
							filter: "blur(70px)",
							animation: anim(
								animate,
								`rox-cine-sway ${MED} ease-in-out infinite reverse`,
							),
						})}
					/>
				</>
			);
		case "nebula":
			return (
				<>
					<div
						style={blob({
							inset: "-15% auto auto -10%",
							height: "85%",
							width: "75%",
							background:
								"radial-gradient(circle at 40% 40%, var(--cine-4) 0%, var(--cine-3) 35%, transparent 70%)",
							opacity: 0.6,
							mixBlendMode: "screen",
							filter: "blur(75px)",
							animation: anim(animate, `rox-cine-spin ${SLOW} linear infinite`),
						})}
					/>
					<div
						style={blob({
							inset: "auto -15% -20% auto",
							height: "70%",
							width: "65%",
							background:
								"radial-gradient(circle at 60% 60%, var(--cine-3) 0%, transparent 65%)",
							opacity: 0.45,
							mixBlendMode: "screen",
							animation: anim(
								animate,
								`rox-cine-spin ${SLOW} linear infinite reverse`,
							),
						})}
					/>
				</>
			);
		case "dunes":
			return (
				<>
					<div
						style={blob({
							inset: "auto -10% -25% -10%",
							height: "70%",
							borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
							background:
								"linear-gradient(0deg, var(--cine-4) 0%, var(--cine-3) 55%, transparent 100%)",
							opacity: 0.5,
							mixBlendMode: "screen",
							filter: "blur(50px)",
							animation: anim(
								animate,
								`rox-cine-drift-a ${MED} ease-in-out infinite`,
							),
						})}
					/>
					<div
						style={blob({
							inset: "auto 5% -15% 5%",
							height: "45%",
							borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
							background:
								"linear-gradient(0deg, var(--cine-3) 0%, transparent 80%)",
							opacity: 0.4,
							mixBlendMode: "screen",
							filter: "blur(40px)",
							animation: anim(
								animate,
								`rox-cine-drift-b ${SLOW} ease-in-out infinite`,
							),
						})}
					/>
				</>
			);
		case "horizon":
			return (
				<>
					<div
						style={blob({
							inset: "auto -5% 8% -5%",
							height: "40%",
							borderRadius: "9999px",
							background:
								"radial-gradient(ellipse 80% 100% at 50% 100%, var(--cine-4) 0%, var(--cine-3) 35%, transparent 72%)",
							opacity: 0.75,
							mixBlendMode: "screen",
							filter: "blur(45px)",
							animation: anim(
								animate,
								`rox-cine-pulse ${MED} ease-in-out infinite`,
							),
						})}
					/>
					<div
						style={blob({
							inset: "auto 20% 20% 20%",
							height: "22%",
							background:
								"radial-gradient(ellipse 70% 100% at 50% 100%, var(--cine-4) 0%, transparent 70%)",
							opacity: 0.6,
							mixBlendMode: "screen",
							filter: "blur(35px)",
							animation: anim(
								animate,
								`rox-cine-drift-a ${FAST} ease-in-out infinite`,
							),
						})}
					/>
				</>
			);
		default:
			return (
				<div
					style={blob({
						inset: "5% 5% 5% 5%",
						background:
							"radial-gradient(circle at 35% 30%, var(--cine-3) 0%, transparent 60%)",
						opacity: 0.45,
						mixBlendMode: "screen",
						filter: "blur(90px)",
						animation: anim(
							animate,
							`rox-cine-drift-a ${SLOW} ease-in-out infinite`,
						),
					})}
				/>
			);
	}
}
