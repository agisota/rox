import { AnimatePresence, motion } from "framer-motion";
import { useShouldAnimate } from "./useMotionPreference";
import { motionDuration } from "./tokens";

interface ShellReadyPulseProps {
	active: boolean;
	onDone: () => void;
}

/**
 * One-shot ring-pulse overlay that fires when the terminal shell first becomes
 * ready (connectionState transitions to "open"). Renders as a sibling inside
 * the pane's `relative` container so it overlays the terminal without touching
 * xterm's canvas measurement. Decorative tier — reduced motion skips it.
 */
export function ShellReadyPulse({ active, onDone }: ShellReadyPulseProps) {
	const shouldAnimate = useShouldAnimate("decorative");
	return (
		<AnimatePresence initial={false}>
			{active && shouldAnimate && (
				<motion.div
					key="shell-ready-pulse"
					className="pointer-events-none absolute inset-0 rounded-sm ring-1 ring-primary/40"
					initial={{ opacity: 0 }}
					animate={{ opacity: [0, 0.6, 0] }}
					transition={{ duration: motionDuration.slow * 2, ease: "easeOut" }}
					onAnimationComplete={onDone}
				/>
			)}
		</AnimatePresence>
	);
}
