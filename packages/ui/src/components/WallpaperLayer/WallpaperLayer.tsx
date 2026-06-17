"use client";

/**
 * WallpaperLayer — a pure, fixed, full-bleed background that crossfades when its
 * `wallpaper` changes (custom-loading-screens epic).
 *
 * Stateless by design: it owns no timer and no rotation logic. The current
 * wallpaper + rotation timer live in a platform store (e.g. the desktop
 * `wallpaperStore`), so navigation/StrictMode remounts never reset the
 * background. The layer simply animates to whatever `wallpaper` it is given.
 */

import type { Wallpaper, WallpaperSource } from "@rox/shared/appearance";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/utils";
import { CinematicGradient } from "../CinematicGradient";

interface WallpaperLayerProps {
	/** Wallpaper to show, or null/undefined for nothing (transparent). */
	wallpaper?: Wallpaper | null;
	/** Crossfade duration in seconds. */
	fadeSeconds?: number;
	/** Extra classes on the fixed container (e.g. z-index, dim overlay). */
	className?: string;
}

/** Stable identity for a source so AnimatePresence remounts on any change. */
function sourceKey(source: WallpaperSource): string {
	switch (source.kind) {
		case "bundled":
			return `bundled:${source.path}`;
		case "remote":
			return `remote:${source.url}`;
		case "gradient":
			return `gradient:${source.colors.join(",")}`;
	}
}

/** Render a wallpaper's visual fill: a cinematic gradient scene or a cover image. */
function WallpaperFill({ wallpaper }: { wallpaper: Wallpaper }) {
	const { source } = wallpaper;
	if (source.kind === "gradient") {
		return (
			<CinematicGradient
				colors={source.colors}
				scene={wallpaper.scene}
				tone={wallpaper.tone}
				className="h-full w-full"
			/>
		);
	}
	const url = source.kind === "bundled" ? source.path : source.url;
	// Encode before interpolating into `url("…")`: encodeURI escapes `"` (→ %22)
	// so a `remote`/user-supplied source can't break out of the quoted value and
	// inject extra CSS. Future remote/user wallpaper packs are anticipated by the
	// manifest, so harden the boundary now.
	return (
		<div
			className="h-full w-full bg-center bg-cover"
			style={{ backgroundImage: `url("${encodeURI(url)}")` }}
			role="img"
			aria-label={wallpaper.name}
		/>
	);
}

/** Fixed full-bleed background that crossfades whenever `wallpaper` changes. */
export function WallpaperLayer({
	wallpaper,
	fadeSeconds = 1.2,
	className,
}: WallpaperLayerProps) {
	// `null` (pre-resolve) collapses to reduced motion so no crossfade flashes
	// for reduced-motion users on first paint.
	const reduceMotion = useReducedMotion() ?? true;
	const duration = reduceMotion ? 0 : fadeSeconds;

	return (
		<div
			aria-hidden
			className={cn("pointer-events-none fixed inset-0 -z-10", className)}
		>
			<AnimatePresence>
				{wallpaper ? (
					<motion.div
						key={`${wallpaper.id}:${sourceKey(wallpaper.source)}`}
						className="absolute inset-0"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration }}
					>
						<WallpaperFill wallpaper={wallpaper} />
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
