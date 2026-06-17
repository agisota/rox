import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
	AlertDialogPrimitive,
	animatedAlertDialogContentClassName,
} from "@rox/ui/alert-dialog";
import { cn } from "@rox/ui/utils";
import { XIcon } from "lucide-react";
import type { MotionStyle } from "motion/react";
import { AnimatePresence, motion } from "motion/react";
import type { ComponentProps } from "react";

import { motionDuration, motionSpring } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

/**
 * Framer-driven Radix dialog content (case 008 / PR-08).
 *
 * Renders the Radix `Portal`/`Overlay`/`Content` triad with `asChild` +
 * `forceMount` so the `motion.div` *is* the content node — Radix keeps its
 * `role="dialog"`, aria wiring, focus trap and autofocus intact while framer
 * owns the open/close transition. `forceMount` + `AnimatePresence` keyed on the
 * `open` boolean restores a real exit animation (replacing the tailwind
 * `data-[state=closed]` keyframes we deliberately don't drive here, since the
 * shared `@rox/ui` dialog primitive belongs to case 013).
 *
 * Reduced motion: when `useShouldAnimate('essential')` is false the content
 * mounts at its final state (`initial={false}`, zero-duration transitions) — an
 * instant open with no transform/opacity offset.
 */
interface AnimatedDialogContentProps
	extends Omit<
		ComponentProps<typeof DialogPrimitive.Content>,
		"asChild" | "forceMount" | "style"
	> {
	/** Drives mount/unmount through `AnimatePresence` for a real exit. */
	open: boolean;
	/**
	 * Render the Radix close (✕) button in the top-right corner, mirroring the
	 * shared `DialogContent`'s default. Off by default so existing borderless
	 * call sites (e.g. the command palette) are unaffected.
	 */
	showCloseButton?: boolean;
	/** Framer style — accepts motion shortcuts (`x`/`y`) for centering. */
	style?: MotionStyle;
}

export function AnimatedDialogContent({
	open,
	children,
	className,
	style,
	showCloseButton = false,
	...props
}: AnimatedDialogContentProps) {
	const animate = useShouldAnimate("essential");

	return (
		<AnimatePresence>
			{open && (
				<DialogPrimitive.Portal forceMount>
					<DialogPrimitive.Overlay asChild forceMount>
						<motion.div
							className="fixed inset-0 z-50 bg-black/50"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: animate ? motionDuration.fast : 0 }}
						/>
					</DialogPrimitive.Overlay>
					<DialogPrimitive.Content asChild forceMount {...props}>
						<motion.div
							className={className}
							// We own the content node now, so horizontal centering moves
							// off Radix's default transform onto a framer `x` value — a
							// tailwind `translate-x-[-50%]` would be clobbered the moment
							// framer writes `scale` into the inline transform.
							style={{ x: "-50%", ...style }}
							initial={animate ? { opacity: 0, scale: 0.96 } : false}
							animate={{ opacity: 1, scale: 1 }}
							exit={animate ? { opacity: 0, scale: 0.96 } : { opacity: 0 }}
							transition={animate ? motionSpring.snappy : { duration: 0 }}
						>
							{children}
							{showCloseButton && (
								<DialogPrimitive.Close
									data-slot="dialog-close"
									className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
								>
									<XIcon />
									<span className="sr-only">Close</span>
								</DialogPrimitive.Close>
							)}
						</motion.div>
					</DialogPrimitive.Content>
				</DialogPrimitive.Portal>
			)}
		</AnimatePresence>
	);
}

/**
 * Framer-driven Radix **alert-dialog** content (case 013 / PR-13) — the
 * `AlertDialogContent` sibling of {@link AnimatedDialogContent}.
 *
 * Alert dialogs are the actual primitive behind the destructive modals
 * (delete workspace / delete project), so this wrapper covers
 * `@radix-ui/react-alert-dialog` rather than `react-dialog`. It renders the
 * `Portal`/`Overlay`/`Content` triad with `asChild` + `forceMount` and keys an
 * `AnimatePresence` off the controlled `open` prop, so the panel plays a real
 * exit on close. The Radix `Content` keeps its `role="alertdialog"`, aria
 * wiring, focus trap and — crucially — the `onOpenAutoFocus` passthrough that
 * the delete dialogs use to retarget focus, since `{...props}` (including
 * `onOpenAutoFocus`) flows straight onto the primitive.
 *
 * Centering moves off the tailwind `translate-x/y-[-50%]` utilities (stripped
 * in {@link animatedAlertDialogContentClassName}) onto framer `x`/`y` style
 * values so the inline `transform` framer writes for the scale spring does not
 * clobber the offset.
 *
 * Reduced motion: when `useShouldAnimate('essential')` is false the panel
 * mounts at its final state (`initial={false}`, zero-duration transitions).
 */
interface AnimatedAlertDialogContentProps
	extends Omit<
		ComponentProps<typeof AlertDialogPrimitive.Content>,
		"asChild" | "forceMount" | "style"
	> {
	/** Drives mount/unmount through `AnimatePresence` for a real exit. */
	open: boolean;
	/** Framer style — accepts motion shortcuts (`x`/`y`) for centering. */
	style?: MotionStyle;
}

export function AnimatedAlertDialogContent({
	open,
	children,
	className,
	style,
	...props
}: AnimatedAlertDialogContentProps) {
	const animate = useShouldAnimate("essential");

	return (
		<AnimatePresence>
			{open && (
				<AlertDialogPrimitive.Portal forceMount>
					<AlertDialogPrimitive.Overlay asChild forceMount>
						<motion.div
							className="fixed inset-0 z-50 bg-black/50"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: animate ? motionDuration.fast : 0 }}
						/>
					</AlertDialogPrimitive.Overlay>
					<AlertDialogPrimitive.Content asChild forceMount {...props}>
						<motion.div
							className={cn(animatedAlertDialogContentClassName, className)}
							// framer owns the inline transform, so the `-50%/-50%`
							// centering offset rides on `x`/`y` instead of the stripped
							// `translate-x/y-[-50%]` utilities.
							style={{ x: "-50%", y: "-50%", ...style }}
							initial={animate ? { opacity: 0, scale: 0.96 } : false}
							animate={{ opacity: 1, scale: 1 }}
							exit={animate ? { opacity: 0, scale: 0.96 } : { opacity: 0 }}
							transition={animate ? motionSpring.snappy : { duration: 0 }}
						>
							{children}
						</motion.div>
					</AlertDialogPrimitive.Content>
				</AlertDialogPrimitive.Portal>
			)}
		</AnimatePresence>
	);
}
