import { cn } from "@rox/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef } from "react";
import {
	motionDuration,
	motionSpring,
	useShouldAnimate,
} from "renderer/motion";

interface ResizablePanelProps {
	/** The content to render inside the panel */
	children: React.ReactNode;
	/** Current width of the panel */
	width: number;
	/** Callback when width changes */
	onWidthChange: (width: number) => void;
	/** Whether the panel is currently being resized */
	isResizing: boolean;
	/** Callback when resizing state changes */
	onResizingChange: (isResizing: boolean) => void;
	/** Minimum allowed width (used for clamping and aria) */
	minWidth: number;
	/** Maximum allowed width (used for clamping and aria) */
	maxWidth: number;
	/** Which side the resize handle should be on */
	handleSide: "left" | "right";
	/** Additional className for the container */
	className?: string;
	/**
	 * If true, the component will clamp width between minWidth and maxWidth.
	 * If false, raw width values are passed to onWidthChange (useful when the
	 * consumer's setWidth handles clamping/snapping logic).
	 * @default true
	 */
	clampWidth?: boolean;
	/** Callback when the resize handle is double-clicked */
	onDoubleClickHandle?: () => void;
}

export function ResizablePanel({
	children,
	width,
	onWidthChange,
	isResizing,
	onResizingChange,
	minWidth,
	maxWidth,
	handleSide,
	className,
	clampWidth = true,
	onDoubleClickHandle,
}: ResizablePanelProps) {
	// Sidebar geometry conveys layout state, so it's the essential motion tier.
	const shouldAnimate = useShouldAnimate("essential");
	// The drag glow + width tooltip are pure affordance, so they ride the
	// decorative tier and degrade to instant toggles under reduced motion.
	const animate = useShouldAnimate("decorative");
	const startXRef = useRef(0);
	const startWidthRef = useRef(0);
	const pendingWidthRef = useRef<number | null>(null);
	const rafIdRef = useRef<number | null>(null);

	const flushPendingWidth = useCallback(() => {
		const pendingWidth = pendingWidthRef.current;
		pendingWidthRef.current = null;
		if (pendingWidth === null) return;
		onWidthChange(pendingWidth);
	}, [onWidthChange]);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			startXRef.current = e.clientX;
			startWidthRef.current = width;
			onResizingChange(true);
		},
		[width, onResizingChange],
	);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isResizing) return;

			const delta = e.clientX - startXRef.current;
			// For left handle, dragging left increases width (invert delta)
			// For right handle, dragging right increases width (normal delta)
			const adjustedDelta = handleSide === "left" ? -delta : delta;
			const newWidth = startWidthRef.current + adjustedDelta;
			const finalWidth = clampWidth
				? Math.max(minWidth, Math.min(maxWidth, newWidth))
				: newWidth;
			pendingWidthRef.current = finalWidth;

			if (rafIdRef.current !== null) return;
			rafIdRef.current = requestAnimationFrame(() => {
				rafIdRef.current = null;
				flushPendingWidth();
			});
		},
		[isResizing, minWidth, maxWidth, handleSide, clampWidth, flushPendingWidth],
	);

	const handleMouseUp = useCallback(() => {
		if (!isResizing) return;

		if (rafIdRef.current !== null) {
			cancelAnimationFrame(rafIdRef.current);
			rafIdRef.current = null;
		}
		flushPendingWidth();
		onResizingChange(false);
	}, [isResizing, onResizingChange, flushPendingWidth]);

	useEffect(() => {
		if (isResizing) {
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			document.body.style.userSelect = "none";
			document.body.style.cursor = "col-resize";
		}

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.userSelect = "";
			document.body.style.cursor = "";
			if (rafIdRef.current !== null) {
				cancelAnimationFrame(rafIdRef.current);
				rafIdRef.current = null;
			}
			pendingWidthRef.current = null;
		};
	}, [isResizing, handleMouseMove, handleMouseUp]);

	return (
		<motion.div
			className={cn(
				"relative h-full shrink-0 overflow-hidden border-border",
				handleSide === "right" ? "border-r" : "border-l",
				className,
			)}
			// Spring the width on discrete open/collapse/double-click changes, but
			// track raw width instantly during drag so the panel stays 1:1 with the
			// cursor (and reduced motion gets the instant value too).
			animate={{ width }}
			transition={
				isResizing || !shouldAnimate ? { duration: 0 } : motionSpring.panel
			}
			style={{ width }}
		>
			{children}
			{/* biome-ignore lint/a11y/useSemanticElements: <hr> is not appropriate for interactive resize handles */}
			<div
				role="separator"
				aria-orientation="vertical"
				aria-valuenow={width}
				aria-valuemin={minWidth}
				aria-valuemax={maxWidth}
				tabIndex={0}
				onMouseDown={handleMouseDown}
				onDoubleClick={onDoubleClickHandle}
				className={cn(
					"absolute top-0 w-5 h-full cursor-col-resize z-10",
					"after:absolute after:top-0 after:w-1 after:h-full after:transition-colors",
					"hover:after:bg-border focus:outline-none focus:after:bg-border",
					isResizing && "after:bg-border",
					handleSide === "left"
						? "-left-2 after:right-2"
						: "-right-2 after:left-2",
				)}
			/>
			{/* Decorative glow over the handle column while dragging. Sibling of
			    the separator, pointer-events-none so it never intercepts drag. */}
			<motion.div
				aria-hidden
				className={cn(
					"pointer-events-none absolute top-0 z-0 h-full w-1",
					handleSide === "left" ? "left-0" : "right-0",
				)}
				initial={false}
				animate={{
					opacity: isResizing ? 1 : 0,
					boxShadow: isResizing
						? "0 0 8px 1px rgba(96,165,250,0.7)"
						: "0 0 0 0 rgba(96,165,250,0)",
				}}
				transition={
					animate ? { duration: motionDuration.fast } : { duration: 0 }
				}
			/>
			{/* Width readout near the handle while dragging. Reads the already
			    RAF-throttled `width` prop, so it adds zero work to mousemove. */}
			<AnimatePresence initial={false}>
				{isResizing && (
					<motion.div
						aria-hidden
						className={cn(
							"pointer-events-none absolute top-2 z-20 rounded bg-popover px-1.5 py-0.5 text-xs tabular-nums text-popover-foreground shadow",
							handleSide === "left" ? "left-2" : "right-2",
						)}
						initial={animate ? { opacity: 0, y: -4 } : false}
						animate={{ opacity: 1, y: 0 }}
						exit={animate ? { opacity: 0, y: -4 } : { opacity: 0 }}
						transition={{ duration: motionDuration.fast }}
					>
						{Math.round(width)}px
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}
