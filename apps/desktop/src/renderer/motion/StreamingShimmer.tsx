import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { ease } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

export interface StreamingShimmerProps {
	/** While `true`, overlay a restrained breathing glow over `children`. */
	active: boolean;
	children: ReactNode;
}

/**
 * Calm "breathing" presence for streamed assistant text. While `active`, a
 * soft, low-opacity glow gently pulses (opacity + scale) behind the leading
 * edge of the text, signalling that the model is still producing output —
 * replacing the harsh left-right sheen bar it used to be. The glow unmounts the
 * instant `active` flips false (streaming complete), leaving the children
 * untouched.
 *
 * Per the motion guardrails this animates a single overlay element with
 * opacity + transform only — no per-character / per-row animation and no
 * sliding background-position gradient across the markdown surface. The
 * decorative loop is gated behind the Full motion preference via
 * {@link useShouldAnimate}; when motion is suppressed the children render plain.
 */
export function StreamingShimmer({ active, children }: StreamingShimmerProps) {
	const shouldAnimate = useShouldAnimate("decorative");

	if (!active || !shouldAnimate) {
		return <>{children}</>;
	}

	return (
		<span style={{ position: "relative", display: "block" }}>
			<motion.span
				aria-hidden
				style={{
					position: "absolute",
					insetInlineStart: 0,
					insetBlockStart: 0,
					blockSize: "1.3em",
					inlineSize: "min(240px, 72%)",
					pointerEvents: "none",
					borderRadius: "9999px",
					background:
						"radial-gradient(60% 100% at 0% 50%, color-mix(in srgb, currentColor 9%, transparent), transparent 75%)",
					transformOrigin: "left center",
					willChange: "opacity, transform",
				}}
				initial={{ opacity: 0.35, scaleX: 0.92 }}
				animate={{ opacity: [0.35, 0.72, 0.35], scaleX: [0.92, 1, 0.92] }}
				transition={{
					duration: 2.4,
					ease: ease.standard,
					repeat: Number.POSITIVE_INFINITY,
					repeatType: "loop",
				}}
			/>
			{children}
		</span>
	);
}
