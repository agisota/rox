import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { ease, motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

interface MenuItemRevealProps {
	index: number;
	children: ReactNode;
}

/**
 * Wraps the inner content of a DropdownMenuItem in a subtle entrance
 * animation (opacity + x slide) staggered by `index`. Does NOT alter
 * DropdownMenuItem semantics — use `className="contents"` so the span is
 * invisible to flex/grid layout. Falls back to a plain fragment when the
 * reduced-motion gate is off.
 */
export function MenuItemReveal({ index, children }: MenuItemRevealProps) {
	const shouldAnimate = useShouldAnimate("decorative");

	if (!shouldAnimate) {
		return <>{children}</>;
	}

	return (
		<motion.span
			className="contents"
			initial={{ opacity: 0, x: -6 }}
			animate={{ opacity: 1, x: 0 }}
			transition={{
				duration: motionDuration.fast,
				delay: index * 0.03,
				ease: ease.standard as [number, number, number, number],
			}}
		>
			{children}
		</motion.span>
	);
}

interface DangerShakeProps {
	children: ReactNode;
}

/**
 * Adds a delayed hover-shake on the wrapped content to signal a destructive
 * action. The shake kicks in after a short hover dwell (0.45s) so it does not
 * fire on fast pass-through hovers. Falls back to a plain fragment when the
 * reduced-motion gate is off.
 */
export function DangerShake({ children }: DangerShakeProps) {
	const shouldAnimate = useShouldAnimate("decorative");

	if (!shouldAnimate) {
		return <>{children}</>;
	}

	return (
		<motion.span
			className="contents"
			whileHover={{ x: [0, -2, 2, -2, 2, 0] }}
			transition={{ delay: 0.45, duration: 0.3 }}
		>
			{children}
		</motion.span>
	);
}
