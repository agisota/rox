"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useMotionTier } from "../../useMotionTier";

export interface FadeLiftProps {
	children: ReactNode;
	className?: string;
	/** Pixels to lift from on entrance. Forced to 0 under reduced-motion. */
	distance?: number;
	/** Entrance duration in seconds. */
	duration?: number;
	/** Entrance delay in seconds. */
	delay?: number;
}

/**
 * Transform-only entrance: content fades and lifts into place once, the first
 * time it enters the viewport. Honors the "clock-safe resting state" rule —
 * when the `off` tier disables entrances, children render immediately at their
 * final position, so a frozen clock or no-JS environment still shows
 * everything.
 */
export function FadeLift({
	children,
	className,
	distance = 12,
	duration = 0.4,
	delay = 0,
}: FadeLiftProps) {
	const { capabilities, prefersReducedMotion } = useMotionTier();

	if (!capabilities.entrance) {
		return <div className={className}>{children}</div>;
	}

	return (
		<motion.div
			className={className}
			initial={{ opacity: 0, y: prefersReducedMotion ? 0 : distance }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration, delay, ease: "easeOut" }}
		>
			{children}
		</motion.div>
	);
}
