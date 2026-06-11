"use client";

import { motion } from "motion/react";
import { STATE_TOKEN } from "../../tokens";
import { useMotionTier } from "../../useMotionTier";

export interface TraceLineProps {
	/** SVG path `d`. Defaults to a gentle S₀ → S✷ curve. */
	d?: string;
	width?: number;
	height?: number;
	strokeWidth?: number;
	/** Draw duration in seconds. */
	duration?: number;
	className?: string;
}

const DEFAULT_D = "M8 56 C 120 56, 120 8, 232 8";

/**
 * The connective tissue of a transition: an SVG path drawn from S₀ to S✷ in the
 * `transition` token color. The draw-on animation runs once on entrance; in the
 * `off` tier the full path renders immediately (clock-safe).
 */
export function TraceLine({
	d = DEFAULT_D,
	width = 240,
	height = 64,
	strokeWidth = 2,
	duration = 1.1,
	className,
}: TraceLineProps) {
	const { capabilities } = useMotionTier();
	const animated = capabilities.entrance;

	return (
		<svg
			className={className}
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			fill="none"
			aria-hidden="true"
		>
			<motion.path
				d={d}
				stroke={STATE_TOKEN.transition}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				initial={animated ? { pathLength: 0 } : { pathLength: 1 }}
				whileInView={animated ? { pathLength: 1 } : undefined}
				viewport={{ once: true }}
				transition={{ duration, ease: "easeInOut" }}
			/>
		</svg>
	);
}
