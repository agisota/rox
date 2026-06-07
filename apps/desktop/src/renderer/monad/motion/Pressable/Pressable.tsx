import { type HTMLMotionProps, motion } from "framer-motion";
import { forwardRef } from "react";
import { springs } from "../tokens";
import { useMotionPreference } from "../useMotionPreference";

export interface PressableProps extends HTMLMotionProps<"button"> {
	/** Scale while pressed. Defaults to 0.97. */
	pressScale?: number;
	/** Scale on hover. Defaults to 1 (no hover grow). */
	hoverScale?: number;
}

/**
 * A button with restrained tactile feedback — transform-only, so it never
 * shifts layout. Press/hover scaling is dropped under reduced motion and when
 * the button is disabled. All native button semantics (focus, keyboard,
 * onClick) are preserved by `motion.button`.
 */
export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(
	function Pressable(
		{ pressScale = 0.97, hoverScale = 1, disabled, children, ...props },
		ref,
	) {
		const { disabled: motionOff } = useMotionPreference();
		const inert = motionOff || disabled;

		return (
			<motion.button
				ref={ref}
				disabled={disabled}
				{...props}
				whileTap={inert ? undefined : { scale: pressScale }}
				whileHover={
					inert || hoverScale === 1 ? undefined : { scale: hoverScale }
				}
				transition={springs.snap}
			>
				{children}
			</motion.button>
		);
	},
);
