import { cn } from "@rox/ui/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useCallback, useRef } from "react";
import { useDrag } from "react-dnd";
import { DefaultHeaderContent } from "./components/DefaultHeaderContent";

interface PaneHeaderProps {
	title: ReactNode;
	icon?: ReactNode;
	iconKey?: string;
	isActive: boolean;
	titleContent?: ReactNode;
	headerExtras?: ReactNode;
	actionsContent: ReactNode;
	toolbar?: ReactNode;
	paneId?: string;
	onClick?: () => void;
	onMiddleClick?: () => void;
}

export const PANE_DRAG_TYPE = "pane";

export function PaneHeader({
	title,
	icon,
	iconKey,
	isActive,
	titleContent,
	headerExtras,
	actionsContent,
	toolbar,
	paneId,
	onClick,
	onMiddleClick,
}: PaneHeaderProps) {
	const [{ isDragging }, connectDrag] = useDrag(
		() => ({
			type: PANE_DRAG_TYPE,
			item: { paneId },
			canDrag: !!paneId,
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[paneId],
	);

	// reduced-motion via framer-motion's own hook (panes cannot import the
	// apps/desktop motion foundation); shouldAnimate = !reduce.
	const shouldAnimate = !useReducedMotion();

	const nodeRef = useRef<HTMLDivElement>(null);
	const setRef = useCallback(
		(node: HTMLDivElement | null) => {
			(nodeRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
			connectDrag(node);
		},
		[connectDrag],
	);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: pane header click-to-pin doesn't need keyboard equivalent
		// biome-ignore lint/a11y/noStaticElementInteractions: click to pin, middle-click to close
		<div
			ref={setRef}
			className={cn(
				"relative overflow-hidden flex h-7 shrink-0 items-center transition-[background-color] duration-150 cursor-grab",
				isActive ? "bg-muted" : "bg-transparent",
				isDragging && "opacity-30",
			)}
			onClick={onClick}
			onAuxClick={(e) => {
				if (e.button === 1 && onMiddleClick) {
					e.preventDefault();
					onMiddleClick();
				}
			}}
		>
			{/* Decorative active-pane focus halo: an absolutely-positioned,
			    pointer-events-none left rail that animates transform+opacity only,
			    driven by the existing isActive prop. Degrades to instant under
			    reduced motion. Never affects layout, hit-testing, or focus. */}
			<AnimatePresence initial={false}>
				{isActive && (
					<motion.div
						key="pane-focus-halo"
						className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-primary"
						style={{ originY: 0.5 }}
						initial={shouldAnimate ? { opacity: 0, scaleY: 0.6 } : false}
						animate={{ opacity: 1, scaleY: 1 }}
						exit={shouldAnimate ? { opacity: 0, scaleY: 0.6 } : { opacity: 0 }}
						transition={
							shouldAnimate
								? { type: "spring", stiffness: 500, damping: 40 }
								: { duration: 0 }
						}
					/>
				)}
			</AnimatePresence>
			{toolbar ?? (
				<DefaultHeaderContent
					title={title}
					icon={icon}
					iconKey={iconKey}
					isActive={isActive}
					titleContent={titleContent}
					headerExtras={headerExtras}
					actionsContent={actionsContent}
				/>
			)}
		</div>
	);
}
