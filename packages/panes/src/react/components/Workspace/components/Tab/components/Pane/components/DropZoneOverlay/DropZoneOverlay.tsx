import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { SplitPosition } from "../../../../../../../../../types";

interface DropZoneOverlayProps {
	position: SplitPosition | null;
}

const ZONE_STYLES: Record<SplitPosition, React.CSSProperties> = {
	top: { top: 0, left: 0, width: "100%", height: "50%" },
	bottom: { top: "50%", left: 0, width: "100%", height: "50%" },
	left: { top: 0, left: 0, width: "50%", height: "100%" },
	right: { top: 0, left: "50%", width: "50%", height: "100%" },
};

// Gentle snap+fade for the drop-zone highlight. Mirrors the motion
// foundation's `layout` preset; inlined because packages/panes must not
// import apps/desktop motion (framer-motion only here).
const SNAP_SPRING = { type: "spring", stiffness: 360, damping: 34 } as const;

export function DropZoneOverlay({ position }: DropZoneOverlayProps) {
	// framer's reduced-motion hook — packages/panes can't reach the
	// apps/desktop `useShouldAnimate` foundation.
	const reduceMotion = useReducedMotion();
	const shouldAnimate = !reduceMotion;

	return (
		<AnimatePresence>
			{position && (
				<div className="pointer-events-none absolute inset-0 z-10">
					<motion.div
						key="dropzone"
						layout
						layoutDependency={position}
						className="absolute rounded-sm border-2 border-primary/70 bg-primary/10"
						style={ZONE_STYLES[position]}
						initial={shouldAnimate ? { opacity: 0 } : false}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={shouldAnimate ? SNAP_SPRING : { duration: 0 }}
					/>
				</div>
			)}
		</AnimatePresence>
	);
}
