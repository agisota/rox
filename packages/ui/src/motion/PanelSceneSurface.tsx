import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { type PanelScene, panelSceneVariants } from "./PanelScene";
import { useShouldAnimate } from "./useMotionPreference";

/**
 * Web/desktop `AnimatePresence` fallback surface for a panel scene — case 054 /
 * PR-54 (#648).
 *
 * When the View Transitions API is unavailable (or a caller prefers the
 * framer-motion path), the right panel renders through this surface: each panel
 * is keyed by identity so opening, closing, and replacing run the scene's
 * enter/exit variants ({@link panelSceneVariants}). On supporting browsers the
 * VT path (`runPanelSceneTransition`) drives the morph instead and this surface
 * simply holds the final state.
 *
 * Decorative tier: when `useShouldAnimate('decorative')` is false (reduced
 * motion / Off / Essential) the panel renders statically with no enter/exit, so
 * the final layout appears instantly.
 */
export function PanelSceneSurface({
	scene,
	panelKey,
	className,
	children,
}: {
	/** The scene currently playing (open/close/replace). */
	scene: PanelScene;
	/**
	 * Identity of the rendered panel; drives the `AnimatePresence` enter/exit
	 * keying so a swap morphs rather than hard-cuts. Defaults to the scene's
	 * `panelId`.
	 */
	panelKey?: string;
	className?: string;
	children: ReactNode;
}) {
	const shouldAnimate = useShouldAnimate("decorative");
	const key = panelKey ?? scene.panelId ?? "panel";

	if (!shouldAnimate) {
		return <div className={className}>{children}</div>;
	}

	const variants = panelSceneVariants(scene);
	return (
		<AnimatePresence mode="wait" initial={false}>
			<motion.div
				key={key}
				className={className}
				initial={variants.initial}
				animate={variants.animate}
				exit={variants.exit}
			>
				{children}
			</motion.div>
		</AnimatePresence>
	);
}
