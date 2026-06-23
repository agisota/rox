import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { motionSpring } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

/**
 * Scale-pop wrapper for a toggled glyph (e.g. a favorite/pin star). When
 * `active` flips, the keyed child cross-fades with a spring scale so the icon
 * "pops" between states. Decorative tier — renders the child instantly (no
 * animation) when reduced motion / `'off'` preference is in effect.
 *
 * Case 022 / PR-22. Reuses {@link motionSpring.pop} + {@link useShouldAnimate}.
 */
export function PopIn({
	active,
	children,
}: {
	active: boolean;
	children: ReactNode;
}) {
	const animate = useShouldAnimate("decorative");
	if (!animate) return <>{children}</>;
	return (
		<AnimatePresence initial={false} mode="wait">
			<motion.span
				key={String(active)}
				className="inline-flex"
				initial={{ scale: 0.4, opacity: 0 }}
				animate={{ scale: 1, opacity: 1 }}
				exit={{ scale: 0.4, opacity: 0 }}
				transition={motionSpring.pop}
			>
				{children}
			</motion.span>
		</AnimatePresence>
	);
}
