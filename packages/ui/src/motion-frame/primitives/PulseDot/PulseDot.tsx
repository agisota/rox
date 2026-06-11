"use client";

import { motion } from "motion/react";
import { STATE_TOKEN, type StateTokenName } from "../../tokens";
import { useMotionTier } from "../../useMotionTier";

export interface PulseDotProps {
	/** Semantic state — selects the token color. */
	state?: StateTokenName;
	/** Diameter in pixels. */
	size?: number;
	className?: string;
}

/**
 * A status dot that breathes while a state is live. The pulse is a loop, so it
 * only animates in the `full` tier; otherwise it renders as a static dot in the
 * same semantic color.
 */
export function PulseDot({
	state = "verified",
	size = 8,
	className,
}: PulseDotProps) {
	const { capabilities } = useMotionTier();
	const style = {
		display: "inline-block",
		width: size,
		height: size,
		borderRadius: "9999px",
		backgroundColor: STATE_TOKEN[state],
	} as const;

	if (!capabilities.loop) {
		return <span className={className} style={style} />;
	}

	return (
		<motion.span
			className={className}
			style={style}
			animate={{ opacity: [1, 0.4, 1], scale: [1, 1.18, 1] }}
			transition={{
				duration: 1.6,
				repeat: Number.POSITIVE_INFINITY,
				ease: "easeInOut",
			}}
		/>
	);
}
