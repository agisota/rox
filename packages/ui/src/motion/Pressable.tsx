import type { HTMLMotionProps } from "motion/react";
import { motion } from "motion/react";
import { forwardRef } from "react";
import { useShouldAnimate } from "./useMotionPreference";

export type PressableProps = HTMLMotionProps<"button">;

/**
 * Button wrapper that adds gated `whileHover` / `whileTap` / `whileFocus`
 * feedback over `motion.button`. The decorative micro-interactions are skipped
 * entirely when motion is disabled or the button is disabled (calm branch),
 * while every passed prop (callbacks, aria, `type`, keyboard handlers) flows
 * through untouched.
 */
export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(
	function Pressable({ disabled, ...props }, ref) {
		const shouldAnimate = useShouldAnimate("decorative");
		const interactive = shouldAnimate && !disabled;

		return (
			<motion.button
				ref={ref}
				disabled={disabled}
				whileHover={interactive ? { y: -1 } : undefined}
				whileTap={interactive ? { scale: 0.96 } : undefined}
				whileFocus={interactive ? { y: -1 } : undefined}
				{...props}
			/>
		);
	},
);

Pressable.displayName = "Pressable";
