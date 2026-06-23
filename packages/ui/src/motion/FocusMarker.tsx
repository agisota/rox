import { motion } from "motion/react";
import { ease, motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

interface FocusMarkerProps {
	/** Changes once per focus-jump; component re-mounts via `key` to re-fire the halo. */
	signature?: string | number;
}

/**
 * One-shot focus halo overlay for diff search-result jumps (case 083).
 * Absolutely positioned, pointer-events-none — safe to render over @pierre CodeView annotations.
 * Re-fires on every `signature` change via React `key` remount.
 */
export function FocusMarker({ signature }: FocusMarkerProps) {
	const shouldAnimate = useShouldAnimate("decorative");
	if (!shouldAnimate || signature == null) return null;

	return (
		<motion.div
			key={String(signature)}
			className="pointer-events-none absolute inset-x-0 inset-y-0 rounded-sm ring-2 ring-blue-400/60"
			initial={{ opacity: 0, scale: 0.96 }}
			animate={{ opacity: [0, 1, 0], scale: 1 }}
			transition={{ duration: motionDuration.slow, ease: ease.standard }}
		/>
	);
}
