import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useShouldAnimate } from "./useMotionPreference";

export interface StreamingShimmerProps {
	/** While `true`, overlay a restrained moving sheen over `children`. */
	active: boolean;
	children: ReactNode;
}

/**
 * Case 052 / Area D. A thin wrapper that overlays a restrained, transform-only
 * sheen across streamed assistant text while `active` is `true`. The decorative
 * loop is gated behind the Full motion preference via {@link useShouldAnimate},
 * and the sheen unmounts the instant `active` flips false (streaming complete),
 * leaving the children untouched.
 *
 * Per the motion guardrails this animates a single overlay element with a
 * transform (`x`) only — no per-character / per-row animation and no animated
 * background-position gradient across the whole markdown surface.
 */
export function StreamingShimmer({ active, children }: StreamingShimmerProps) {
	const shouldAnimate = useShouldAnimate("decorative");

	if (!active || !shouldAnimate) {
		return <>{children}</>;
	}

	return (
		<span style={{ position: "relative", display: "block" }}>
			{children}
			<motion.span
				aria-hidden
				style={{
					position: "absolute",
					inset: 0,
					pointerEvents: "none",
					background:
						"linear-gradient(100deg, transparent 35%, color-mix(in srgb, currentColor 10%, transparent) 50%, transparent 65%)",
					willChange: "transform",
				}}
				initial={{ x: "-120%" }}
				animate={{ x: "120%" }}
				transition={{
					duration: 1.6,
					ease: "linear",
					repeat: Infinity,
					repeatType: "loop",
				}}
			/>
		</span>
	);
}
