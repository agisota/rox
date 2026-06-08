import type { TargetAndTransition, Transition } from "framer-motion";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { ease, motionDuration } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

/**
 * Shared source of truth for the Quick Open → file pane "open file" transition
 * (case 047 / PR-47).
 *
 * The chosen Quick Open row plays a brief lift/morph-and-fade as the Radix
 * dialog dismisses, while the freshly opened file pane can entrance with a
 * scale-from-.98/opacity fade. A TRUE cross-tree `layoutId` morph is unreliable
 * here — the dialog lives in a `DialogPrimitive.Portal` while the pane lives in
 * the virtualized/DnD `@rox/panes` tree (separate `AnimatePresence` roots) — so
 * both sides reuse {@link fileLayoutId} only as a coordinated namespace, each
 * with a guaranteed non-layout fallback. Everything gates on reduced motion.
 */

/** Stable `layoutId` namespace shared by the exit flourish + pane entrance. */
export function fileLayoutId(path: string): string {
	return `quickopen-file-${path}`;
}

/**
 * Exit-flourish animation props for the selected Quick Open row. Spread onto a
 * `motion.create(CommandPrimitive.Item)` only while the row is the one being
 * opened; callers must gate on {@link useShouldAnimate} first.
 */
export const fileRowOpeningAnimation: {
	animate: TargetAndTransition;
	transition: Transition;
} = {
	animate: { scale: [1, 1.03, 0.98], opacity: [1, 1, 0] },
	transition: { duration: 0.22, ease: ease.standard },
};

interface FilePaneEntranceProps {
	path: string;
	children: ReactNode;
	className?: string;
}

/**
 * Entrance wrapper for a freshly opened file pane. Renders a static container
 * under reduced motion so the pane appears instantly; otherwise it fades up
 * from scale .98. Reuses {@link fileLayoutId} so the namespace matches the row
 * flourish when both ends ever sit under one `LayoutGroup`.
 */
export function FilePaneEntrance({
	path,
	children,
	className,
}: FilePaneEntranceProps) {
	const shouldAnimate = useShouldAnimate("essential");
	if (!shouldAnimate) {
		return <div className={className}>{children}</div>;
	}
	return (
		<motion.div
			layoutId={fileLayoutId(path)}
			className={className}
			initial={{ opacity: 0, scale: 0.98 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: motionDuration.base, ease: ease.standard }}
		>
			{children}
		</motion.div>
	);
}
