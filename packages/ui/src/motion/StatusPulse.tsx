import { cn } from "@rox/ui/utils";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useShouldAnimate } from "./useMotionPreference";

export interface StatusPulseProps {
	className?: string;
	/** When `false`, render a static dot with no pulse. Defaults to `true`. */
	active?: boolean;
	/** Pulse once instead of looping. Defaults to looping. */
	once?: boolean;
	/**
	 * Tailwind background class for the dot. Defaults to `bg-current` so the dot
	 * inherits the surrounding text color (existing behavior). Callers that style
	 * by status (e.g. `bg-amber-400`) can override it here.
	 */
	colorClassName?: string;
	/**
	 * When provided, animate the children with a scale+opacity pulse instead of
	 * rendering a standalone dot. The children become the pulse target.
	 */
	children?: ReactNode;
}

/**
 * Self-gating status dot that pulses (opacity + scale). Renders a static dot
 * when motion is disabled, when `active` is `false`, or — being decorative —
 * whenever the `decorative` tier is suppressed.
 *
 * When `children` are provided, the component acts as a wrapper that pulses
 * the children (e.g. an icon avatar) instead of rendering a standalone dot.
 */
export function StatusPulse({
	className,
	active = true,
	once = false,
	colorClassName = "bg-current",
	children,
}: StatusPulseProps) {
	const shouldAnimate = useShouldAnimate("decorative");

	if (children) {
		// Wrapper mode: pulse the children on scale + opacity
		if (!shouldAnimate || !active) {
			return <>{children}</>;
		}
		return (
			<motion.span
				className={cn("inline-flex", className)}
				animate={{ scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
				transition={{
					duration: 1.4,
					ease: "easeInOut",
					repeat: once ? 0 : Infinity,
				}}
			>
				{children}
			</motion.span>
		);
	}

	// Dot mode — original behavior
	const baseClassName = cn(
		"inline-block size-2 rounded-full",
		colorClassName,
		className,
	);

	if (!shouldAnimate || !active) {
		return <span className={baseClassName} />;
	}

	return (
		<motion.span
			className={baseClassName}
			animate={{ opacity: [1, 0.4, 1], scale: [1, 1.25, 1] }}
			transition={{
				duration: 1.4,
				ease: "easeInOut",
				repeat: once ? 0 : Infinity,
			}}
		/>
	);
}
