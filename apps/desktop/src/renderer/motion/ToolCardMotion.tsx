import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { ease, motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

type WsToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

/**
 * Lifecycle wrapper for a single tool-call card (case 054 / PR-54).
 *
 * The ToolCallBlock dispatcher draws ~30 different tool-specific renderers; this
 * thin `motion.div` wraps whatever it returns exactly once, keyed off the
 * existing `toWsToolState(part)` value, so every card shares one entrance +
 * status animation without touching the shared `@rox/ui` renderers:
 *   - enter: opacity + y fade-up (essential tier — gates the whole effect)
 *   - pending (input-streaming/input-available): a restrained opacity pulse
 *   - success (output-available): a brief scale "pop"
 *   - error (output-error): a short x-keyframe shake
 *
 * The pending/pop/shake decoration is decorative-tier; with reduced motion the
 * card simply renders its final resting state.
 */
export function ToolCardMotion({
	state,
	children,
}: {
	state: WsToolState;
	children: ReactNode;
}) {
	// 'essential' gates the enter; 'decorative' gates the pending pulse / shake / pop.
	const animateEnter = useShouldAnimate("essential");
	const animateDecorative = useShouldAnimate("decorative");
	if (!animateEnter) return <div>{children}</div>;

	const isPending = state === "input-streaming" || state === "input-available";
	const isError = state === "output-error";
	const isSuccess = state === "output-available";

	const animate = !animateDecorative
		? { opacity: 1, y: 0, x: 0, scale: 1 }
		: isError
			? { opacity: 1, y: 0, scale: 1, x: [0, -3, 3, -2, 2, 0] }
			: isPending
				? { opacity: [0.72, 1, 0.72], y: 0, x: 0, scale: 1 }
				: isSuccess
					? { opacity: 1, y: 0, x: 0, scale: [1, 1.012, 1] }
					: { opacity: 1, y: 0, x: 0, scale: 1 };

	const transition =
		isPending && animateDecorative
			? { duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: ease.standard }
			: { duration: motionDuration.fast, ease: ease.standard };

	return (
		<motion.div
			initial={{ opacity: 0, y: 4 }}
			animate={animate}
			transition={transition}
			style={{ willChange: "transform, opacity" }}
		>
			{children}
		</motion.div>
	);
}
