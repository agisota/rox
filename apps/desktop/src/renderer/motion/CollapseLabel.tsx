import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { motionSpring } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

interface CollapseLabelProps {
	/**
	 * Whether the label should be visible. Drive this from the sidebar's
	 * `!isCollapsed` so the text crossfades out as the rail contracts and in as
	 * it expands, while the adjacent icon stays put and appears to "align".
	 */
	show: boolean;
	/** The label content (kept as a single inline node). */
	children: ReactNode;
	/** Forwarded to the rendered `span` so existing layout classes are preserved. */
	className?: string;
}

/**
 * Reusable crossfade wrapper for collapsible sidebar labels (case 025 / PR-25).
 *
 * Renders the label as a `motion.span` that slides + fades on enter/exit, so the
 * workspace sidebar morphs smoothly between its expanded (labels visible) and
 * collapsed icon-rail states. Decorative tier — under reduced motion the label
 * snaps to its final state with no transform, matching the prior instant render.
 * Layout is unchanged: it still emits a single `span` carrying `className`.
 */
export function CollapseLabel({
	show,
	children,
	className,
}: CollapseLabelProps) {
	const animate = useShouldAnimate("decorative");

	return (
		<AnimatePresence initial={animate}>
			{show && (
				<motion.span
					className={className}
					initial={animate ? { opacity: 0, x: -6 } : false}
					animate={{ opacity: 1, x: 0 }}
					exit={animate ? { opacity: 0, x: -6 } : { opacity: 0 }}
					transition={animate ? motionSpring.sidebarCollapse : { duration: 0 }}
				>
					{children}
				</motion.span>
			)}
		</AnimatePresence>
	);
}
