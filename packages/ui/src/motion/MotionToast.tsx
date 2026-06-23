import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ease, motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

export interface MotionToastProps {
	children: ReactNode;
}

/**
 * Entrance wrapper for `unstyled` custom sonner toasts (e.g. {@link UpdateToast}).
 *
 * `toast.custom(..., { unstyled: true })` disables sonner's default chrome and
 * animation for that node, so a framer-motion wrapper can own its entrance
 * cleanly without fighting sonner's own inline transforms. We deliberately use
 * transform + opacity ONLY and add no `layout` prop — stack reflow, swipe, and
 * mount/unmount stay owned by sonner. `x: 24` slides in from the right edge to
 * match the bottom-right/top-right anchor. Renders a plain wrapper when motion
 * is disabled.
 */
export function MotionToast({ children }: MotionToastProps) {
	const shouldAnimate = useShouldAnimate();

	if (!shouldAnimate) {
		return <div>{children}</div>;
	}

	return (
		<motion.div
			initial={{ opacity: 0, x: 24, scale: 0.98 }}
			animate={{ opacity: 1, x: 0, scale: 1 }}
			exit={{ opacity: 0, scale: 0.96 }}
			transition={{ duration: motionDuration.fast, ease: ease.standard }}
			style={{ willChange: "transform, opacity" }}
		>
			{children}
		</motion.div>
	);
}
