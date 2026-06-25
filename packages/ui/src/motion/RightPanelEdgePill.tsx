import { cn } from "@rox/ui/utils";
import { PanelRightIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { rightPanelGeometry } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

export interface RightPanelEdgePillProps {
	/**
	 * Whether the pill is shown. Drives an `AnimatePresence` so the pill glides
	 * out as the panel reopens. Hosts pass `state === "hidden"`.
	 */
	visible: boolean;
	/** Reopen handler — hosts call the panel store's `expand()`. */
	onOpen: () => void;
	/** Accessible label; defaults to a files-panel reopen description. */
	label?: string;
	className?: string;
}

/**
 * Floating edge-pill that reopens the right files panel from its `hidden` state
 * — case F03 / #616. The favourite ④ panel collapses to width 0; this 34×44 pill
 * pins to the right edge, vertically centred, as the only reopen affordance. One
 * click → `expanded`.
 *
 * Motion is gated on the essential governor (`useShouldAnimate('essential')`):
 * full-motion hosts get a slide-in from the right edge, reduced-motion hosts get
 * an instant opacity swap, and `motion`-off hosts render the final state with no
 * transition. The geometry (size) comes from the shared `rightPanelGeometry`
 * token so desktop, web, and mobile size the pill identically.
 */
export function RightPanelEdgePill({
	visible,
	onOpen,
	label = "Open files panel",
	className,
}: RightPanelEdgePillProps) {
	const shouldAnimate = useShouldAnimate("essential");

	return (
		<AnimatePresence initial={false}>
			{visible && (
				<motion.button
					type="button"
					aria-label={label}
					title={label}
					onClick={onOpen}
					data-right-panel-edge-pill=""
					className={cn(
						"absolute top-1/2 right-0 z-20 flex -translate-y-1/2 items-center justify-center",
						"rounded-l-md border border-border border-r-0 bg-background/95 text-muted-foreground shadow-sm backdrop-blur",
						"transition-colors hover:bg-accent hover:text-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						className,
					)}
					style={{
						width: rightPanelGeometry.edgePillWidth,
						height: rightPanelGeometry.edgePillHeight,
					}}
					initial={shouldAnimate ? { x: "100%", opacity: 0 } : false}
					animate={{ x: 0, opacity: 1 }}
					exit={shouldAnimate ? { x: "100%", opacity: 0 } : { opacity: 0 }}
					transition={
						shouldAnimate
							? { duration: 0.24, ease: [0.2, 0, 0, 1] }
							: { duration: 0 }
					}
				>
					<PanelRightIcon className="size-4" aria-hidden="true" />
				</motion.button>
			)}
		</AnimatePresence>
	);
}
