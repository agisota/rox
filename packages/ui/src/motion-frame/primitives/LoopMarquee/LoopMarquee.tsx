"use client";

import { motion } from "motion/react";
import { cn } from "../../../lib/utils";
import { useMotionTier } from "../../useMotionTier";

export interface LoopMarqueeProps {
	children: React.ReactNode;
	className?: string;
	/** Seconds for one full loop. */
	duration?: number;
	direction?: "left" | "right";
}

/**
 * Endless horizontal marquee. Loop-gated by the governor: it only scrolls in
 * `full` (`capabilities.loop`), where the content is duplicated (second copy
 * `aria-hidden`) for a seamless wrap and animated via `whileInView`, so the
 * loop parks when scrolled out of the viewport. In `essential` / `off` /
 * reduced-motion it renders a single static row — content stays readable,
 * nothing moves.
 */
export function LoopMarquee({
	children,
	className,
	duration = 24,
	direction = "left",
}: LoopMarqueeProps) {
	const { capabilities } = useMotionTier();

	if (!capabilities.loop) {
		return (
			<div className={cn("overflow-hidden", className)}>
				<div className="flex w-max items-center gap-12">{children}</div>
			</div>
		);
	}

	const from = direction === "left" ? "0%" : "-50%";
	const to = direction === "left" ? "-50%" : "0%";

	return (
		<div className={cn("overflow-hidden", className)}>
			<motion.div
				className="flex w-max items-center gap-12"
				initial={{ x: from }}
				whileInView={{
					x: to,
					// Scoped here so only the loop repeats — the revert-to-initial
					// when scrolled offscreen uses the default one-shot transition.
					transition: { duration, ease: "linear", repeat: Infinity },
				}}
			>
				<div className="flex shrink-0 items-center gap-12">{children}</div>
				<div aria-hidden className="flex shrink-0 items-center gap-12">
					{children}
				</div>
			</motion.div>
		</div>
	);
}
