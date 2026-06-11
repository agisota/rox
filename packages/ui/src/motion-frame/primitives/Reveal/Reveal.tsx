"use client";

import { motion } from "motion/react";
import { cn } from "../../../lib/utils";
import { useMotionTier } from "../../useMotionTier";

type RevealDirection = "up" | "down" | "left" | "right";

const OFFSET: Record<RevealDirection, { x?: string; y?: string }> = {
	up: { y: "100%" },
	down: { y: "-100%" },
	left: { x: "100%" },
	right: { x: "-100%" },
};

export interface RevealProps {
	children: React.ReactNode;
	className?: string;
	/** Where the content slides in from, behind the clipping mask. */
	direction?: RevealDirection;
	/** Seconds. */
	duration?: number;
	/** Seconds. */
	delay?: number;
}

/**
 * Masked entrance: content slides into view from behind an overflow-hidden
 * edge. Transform-only (no opacity fade), so the resting state is fully
 * opaque. Entrance-gated by the governor — `essential` keeps it,
 * reduced-motion / `off` render a static block.
 */
export function Reveal({
	children,
	className,
	direction = "up",
	duration = 0.5,
	delay = 0,
}: RevealProps) {
	const { capabilities } = useMotionTier();

	if (!capabilities.entrance) {
		return <div className={cn("overflow-hidden", className)}>{children}</div>;
	}

	return (
		<div className={cn("overflow-hidden", className)}>
			<motion.div
				initial={OFFSET[direction]}
				transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
				viewport={{ once: true, margin: "-10%" }}
				whileInView={{ x: 0, y: 0 }}
			>
				{children}
			</motion.div>
		</div>
	);
}
