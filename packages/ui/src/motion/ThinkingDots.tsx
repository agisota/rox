import { cn } from "@rox/ui/utils";
import { motion } from "motion/react";
import { useShouldAnimate } from "./useMotionPreference";

export interface ThinkingDotsProps {
	className?: string;
}

/** Per-dot bob: rise + brighten, then settle. */
const dotVariants = {
	initial: { y: 0, opacity: 0.4 },
	animate: { y: [0, -3, 0], opacity: [0.4, 1, 0.4] },
};

/**
 * Decorative "dot wave" placed beside a thinking/typing label. Three dots bob
 * in a staggered loop using transform + opacity only. Self-gates on the
 * `decorative` tier: when motion is suppressed it renders a static `…` so the
 * "Thinking…" meaning is preserved. Marked `aria-hidden` — the accompanying
 * label carries the accessible text. Inherits the surrounding text color.
 */
export function ThinkingDots({ className }: ThinkingDotsProps) {
	const shouldAnimate = useShouldAnimate("decorative");

	if (!shouldAnimate) {
		return (
			<span className={className} aria-hidden="true">
				…
			</span>
		);
	}

	return (
		<span
			className={cn("inline-flex items-center gap-0.5", className)}
			aria-hidden="true"
		>
			{[0, 1, 2].map((i) => (
				<motion.span
					key={i}
					variants={dotVariants}
					initial="initial"
					animate="animate"
					transition={{
						duration: 1.1,
						repeat: Infinity,
						ease: "easeInOut",
						delay: i * 0.15,
					}}
				>
					•
				</motion.span>
			))}
		</span>
	);
}
