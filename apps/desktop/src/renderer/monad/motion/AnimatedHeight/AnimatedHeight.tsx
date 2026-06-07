import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { duration, ease, instant } from "../tokens";
import { useMotionPreference } from "../useMotionPreference";

export interface AnimatedHeightProps {
	/** When false, collapses to height 0. Defaults to true. */
	open?: boolean;
	children: ReactNode;
	className?: string;
}

/**
 * Animates a region open/closed using Framer's native `height: auto`
 * measurement — no manual ResizeObserver, no first-paint flash (`initial`
 * is `false`, so the resting state is shown immediately). A tween (not a
 * spring) drives the height, so a keyword target never overshoots or snaps.
 * Content size changes while open reflow instantly; only the toggle animates.
 *
 * When closed, the region is `inert` + `aria-hidden`, so collapsed content is
 * removed from the focus order and the accessibility tree.
 *
 * Used for: changes-tree folders (PR-10), presets bar (PR-12), diff sections.
 */
export function AnimatedHeight({
	open = true,
	children,
	className,
}: AnimatedHeightProps) {
	const { disabled } = useMotionPreference();

	return (
		<motion.div
			className={className}
			style={{ overflow: "hidden" }}
			inert={!open}
			aria-hidden={!open}
			initial={false}
			animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
			transition={
				disabled ? instant : { duration: duration.base, ease: ease.standard }
			}
		>
			{children}
		</motion.div>
	);
}
