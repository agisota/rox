import type { LegacyAnimationControls } from "motion/react";
import { motion, useAnimationControls } from "motion/react";
import { type ReactNode, useCallback } from "react";
import { motionShake } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

interface ShakeProps {
	controls: LegacyAnimationControls;
	children: ReactNode;
	className?: string;
}

/** Wraps children in a motion.div driven by external animation controls. */
export function Shake({ controls, children, className }: ShakeProps) {
	return (
		<motion.div className={className} animate={controls}>
			{children}
		</motion.div>
	);
}

/**
 * Returns `{ controls, trigger }`. `trigger()` fires the shake animation when
 * the essential motion tier is active; no-ops when reduced motion is off.
 * Pass `controls` to `<Shake>` and call `trigger()` on error.
 */
export function useShake() {
	const controls = useAnimationControls();
	const shouldAnimate = useShouldAnimate("essential");

	const trigger = useCallback(() => {
		if (!shouldAnimate) return;
		void controls.start(motionShake);
	}, [shouldAnimate, controls]);

	return { controls, trigger };
}
