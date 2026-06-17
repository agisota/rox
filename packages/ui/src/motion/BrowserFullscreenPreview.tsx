import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect } from "react";
import { motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

interface BrowserFullscreenPreviewProps {
	/** Whether the browser pane is currently in fullscreen preview mode. */
	isFullscreen: boolean;
	/** Called when the user dismisses fullscreen (Escape or backdrop click). */
	onExit: () => void;
	/** Stable pane ID — drives the shared `layoutId` so framer can tween the frame. */
	paneId: string;
	/** Content (always mounted — the native BrowserView must not be detached). */
	children: ReactNode;
	/** Classes for the frame in its normal (non-fullscreen) state. */
	className?: string;
}

/**
 * Animated fullscreen-preview wrapper for a browser pane (case 105).
 *
 * Renders:
 *  - A `motion.div` backdrop (fixed, z-40) that fades in/out behind the frame.
 *  - A `layout`-animated frame (z-50 when fullscreen) that grows from the
 *    pane's current DOM position to `fixed inset-4`.
 *
 * Children (including the native-BrowserView placeholder) are always mounted
 * so Electron never detaches the view. The native view re-tracks to the new
 * bounds through the registry's existing geometry observer.
 */
export function BrowserFullscreenPreview({
	isFullscreen,
	onExit,
	paneId,
	children,
	className = "relative flex flex-1 h-full",
}: BrowserFullscreenPreviewProps) {
	const animate = useShouldAnimate("decorative");

	// Scoped Escape handler — capture phase prevents global workspace hotkeys from also firing.
	useEffect(() => {
		if (!isFullscreen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				onExit();
			}
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [isFullscreen, onExit]);

	return (
		<>
			<AnimatePresence>
				{isFullscreen && (
					<motion.div
						key={`browser-fs-backdrop-${paneId}`}
						className="fixed inset-0 z-40 bg-background/70"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: animate ? motionDuration.fast : 0 }}
						onClick={onExit}
					/>
				)}
			</AnimatePresence>
			<motion.div
				layoutId={`browser-fs-frame-${paneId}`}
				layout={animate}
				className={
					isFullscreen
						? "fixed inset-4 z-50 overflow-hidden rounded-lg shadow-2xl bg-background"
						: className
				}
			>
				{children}
			</motion.div>
		</>
	);
}
