import { AnimatePresence, motion } from "framer-motion";
import { useShouldAnimate } from "./useMotionPreference";

interface BrowserLoadingBarProps {
	loading: boolean;
}

export function BrowserLoadingBar({ loading }: BrowserLoadingBarProps) {
	const animate = useShouldAnimate("essential");

	return (
		<AnimatePresence>
			{loading && (
				<motion.div
					key="browser-loading-bar"
					className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 origin-left bg-primary"
					initial={
						animate ? { scaleX: 0, opacity: 1 } : { scaleX: 1, opacity: 1 }
					}
					animate={animate ? { scaleX: 0.9 } : { scaleX: 1 }}
					exit={{ scaleX: 1, opacity: 0 }}
					transition={
						animate
							? {
									scaleX: { duration: 1.2, ease: "easeOut" },
									opacity: { duration: 0.2 },
								}
							: { duration: 0 }
					}
				/>
			)}
		</AnimatePresence>
	);
}
