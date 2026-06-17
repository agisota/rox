import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

export interface RevealFlashProps {
	/** Bounding rect of the just-revealed row, in viewport coords, or null. */
	rect: DOMRect | null;
	/** Cleared once the flash finishes so the parent can drop the rect state. */
	onDone?: () => void;
}

/**
 * One-shot highlight flash overlaid on a given `DOMRect` (case 048). Used to
 * draw the eye to a file row just revealed in the Pierre file tree, whose rows
 * are virtualized inside an open shadow root we must not animate directly.
 *
 * Anchors a fixed, pointer-transparent `motion.div` over the row's rect (the
 * same rect-anchor technique as ShadowClickHint) and pulses opacity once —
 * transform + opacity only, so it can't reflow the tree or fight virtualization.
 * Renders nothing under reduced motion or when there's no rect.
 */
export function RevealFlash({ rect, onDone }: RevealFlashProps) {
	const shouldAnimate = useShouldAnimate();
	if (!shouldAnimate) return null;

	return createPortal(
		<AnimatePresence onExitComplete={onDone}>
			{rect && (
				<motion.div
					key={`${rect.top}:${rect.left}`}
					aria-hidden
					className="rounded-[4px] bg-accent"
					style={{
						position: "fixed",
						left: rect.left,
						top: rect.top,
						width: rect.width,
						height: rect.height,
						pointerEvents: "none",
						zIndex: 50,
					}}
					initial={{ opacity: 0 }}
					animate={{ opacity: [0, 0.5, 0] }}
					exit={{ opacity: 0 }}
					transition={{ duration: motionDuration.slow * 2, ease: "easeOut" }}
					onAnimationComplete={onDone}
				/>
			)}
		</AnimatePresence>,
		document.body,
	);
}
