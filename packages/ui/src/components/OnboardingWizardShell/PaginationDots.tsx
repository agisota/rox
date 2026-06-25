"use client";

/**
 * PaginationDots — the onboarding step indicator (F48, #637).
 *
 * Lifted from the desktop onboarding into `@rox/ui` so web + desktop share one
 * dots primitive (mobile renders its own RN dots over the same neutral nav
 * state). Visual + motion parity with the original desktop dots: an active dot
 * animates via a shared `layoutId` spring, gated by `useShouldAnimate`.
 */

import { motion } from "motion/react";

import { cn } from "../../lib/utils";
import { useShouldAnimate } from "../../motion/useMotionPreference";

export interface PaginationDotsProps {
	/** Zero-based index of the active dot. */
	current: number;
	/** Total number of dots. */
	total: number;
	className?: string;
}

export function PaginationDots({
	current,
	total,
	className,
}: PaginationDotsProps) {
	const shouldAnimate = useShouldAnimate("decorative");
	const dots = Array.from({ length: total }, (_, i) => `dot-${i}`);
	return (
		<div className={cn("flex items-center gap-1.5", className)}>
			{dots.map((id, i) => (
				<span
					key={id}
					aria-hidden
					className="relative size-1.5 rounded-full bg-muted-foreground/30"
				>
					{i === current && (
						<motion.span
							layoutId="onboarding-dot-active"
							className="absolute inset-0 rounded-full bg-foreground"
							transition={
								shouldAnimate
									? { type: "spring", stiffness: 400, damping: 30 }
									: { duration: 0 }
							}
						/>
					)}
				</span>
			))}
		</div>
	);
}
