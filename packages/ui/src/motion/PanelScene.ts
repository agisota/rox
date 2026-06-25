import type { TargetAndTransition, Transition } from "motion/react";
import { PANEL_SCENE_VT_NAME, panelSceneMotion } from "./tokens";
import { shouldAnimate } from "./useMotionPreference";

/**
 * Platform-neutral panel scene descriptor — case 054 / PR-54 (#648).
 *
 * A `PanelScene` names *what* is happening to a panel surface (open, close, or
 * replace one panel with another) without binding to any platform mechanism.
 * Each surface maps it to its native motion:
 *
 * - **Web** → the View Transitions API (`document.startViewTransition`) where
 *   supported, with a framer-motion `AnimatePresence` fallback otherwise
 *   ({@link runPanelSceneTransition}).
 * - **Desktop** → pane-springs from `motionSpring.panel`
 *   ({@link panelSceneVariants} / {@link panelSceneTransition}).
 * - **Mobile (RN)** → a Reanimated slide-over ({@link panelSceneSlide}).
 *
 * The descriptor is the single source of truth: the right-panel (F03/F30)
 * open/close, the F05 region reflow, and the F56 zen scene all speak in
 * `PanelScene`, then hand it to their surface mapper. Every mapper obeys the
 * motion governor (`useShouldAnimate` / `shouldAnimate`) and falls back to the
 * instant final state under reduced / off energy.
 */
export type PanelSceneKind = "open" | "close" | "replace";

export interface PanelScene {
	/** What is happening to the panel surface. */
	kind: PanelSceneKind;
	/**
	 * Identity of the panel being opened/closed, or — for `replace` — the panel
	 * arriving. Used to namespace the web `view-transition-name` and to key the
	 * framer-motion `AnimatePresence` fallback so a swap reads as one morph.
	 */
	panelId?: string;
	/** For `replace`: identity of the outgoing panel. */
	fromId?: string;
}

/** Construct an "open panel" scene. */
export function openPanelScene(panelId?: string): PanelScene {
	return { kind: "open", panelId };
}

/** Construct a "close panel" scene. */
export function closePanelScene(panelId?: string): PanelScene {
	return { kind: "close", panelId };
}

/** Construct a "replace `fromId` with `toId`" scene. */
export function replacePanelScene(toId?: string, fromId?: string): PanelScene {
	return { kind: "replace", panelId: toId, fromId };
}

/**
 * Stable `view-transition-name` for the panel a scene acts on. Web call sites
 * set this on the panel root (`style={{ viewTransitionName }}`) so the VT API
 * morphs that element across the swap. A `replace` scene reuses the namespace
 * so the outgoing and incoming panels are treated as the same morph target.
 */
export function panelSceneViewTransitionName(scene: PanelScene): string {
	const id = scene.panelId ?? scene.fromId;
	return id ? `${PANEL_SCENE_VT_NAME}-${id}` : PANEL_SCENE_VT_NAME;
}

/**
 * Whether the host environment can run a real View Transition right now. Guards
 * against SSR (no `document`) and browsers without the API, so callers always
 * have a defined fallback path.
 */
export function supportsViewTransitions(): boolean {
	return (
		typeof document !== "undefined" &&
		typeof document.startViewTransition === "function"
	);
}

/**
 * Run a panel scene on the **web** surface.
 *
 * `apply` mutates the DOM/React state into the scene's final layout (open the
 * panel, swap its contents, …). When the View Transitions API is available and
 * motion is enabled, the swap is wrapped in `document.startViewTransition` so
 * the browser morphs between the before/after snapshots; otherwise `apply` runs
 * synchronously and the caller's `AnimatePresence` provides the fallback
 * enter/exit (or, under reduced motion, an instant cut with no animation).
 *
 * The scene's `kind` is forwarded to the VT as an active transition type
 * (`view-transition-type`), so stylesheets can scope morph keyframes per
 * open/close/replace scene. Resolves once the transition has finished (or
 * immediately on the fallback path), so callers can sequence follow-up work.
 */
export function runPanelSceneTransition(
	scene: PanelScene,
	apply: () => void,
	options: { animate?: boolean } = {},
): Promise<void> {
	// Decorative-tier morph: the panel content swap is always applied; only the
	// *animation* is gated. `animate` lets a React caller pass the already-read
	// `useShouldAnimate('decorative')` value; otherwise fall back to the
	// imperative accessor.
	const allowMotion = options.animate ?? shouldAnimate("decorative");

	if (!allowMotion || !supportsViewTransitions()) {
		apply();
		return Promise.resolve();
	}

	try {
		return document
			.startViewTransition({
				update: () => {
					apply();
				},
				types: [`panel-${scene.kind}`],
			})
			.finished.catch(() => {
				// A VT can reject if interrupted by a newer one — the DOM is already in
				// its final state, so swallow and resolve.
			});
	} catch {
		// Defensive: if the API throws synchronously, fall back to a hard swap.
		apply();
		return Promise.resolve();
	}
}

/**
 * Desktop / web `AnimatePresence` fallback variants for a panel scene — the
 * pane-spring path (`motionSpring.panel`). Spread `initial`/`animate`/`exit`
 * onto the panel's `motion.div`; callers gate on `useShouldAnimate` and pass
 * `initial={false}` when motion is disabled so the panel appears instantly.
 *
 * The entering panel slides in from its trailing edge; the exiting panel slides
 * back out. A `replace` scene additionally dips opacity so the swap reads as a
 * cross-fade rather than two unrelated slides.
 */
export function panelSceneVariants(scene: PanelScene): {
	initial: TargetAndTransition;
	animate: TargetAndTransition;
	exit: TargetAndTransition;
} {
	const { enterOffset, exitOffset, replaceFade, spring } = panelSceneMotion;
	const enterDim = scene.kind === "replace" ? replaceFade : 0;
	return {
		initial: { x: enterOffset, opacity: enterDim },
		animate: { x: 0, opacity: 1, transition: spring },
		exit: { x: exitOffset, opacity: 0, transition: spring },
	};
}

/** The spring driving a panel scene — for callers that animate manually. */
export function panelSceneTransition(_scene: PanelScene): Transition {
	return panelSceneMotion.spring;
}

/**
 * Mobile (RN) slide-over targets for a panel scene. RN is not imported here —
 * the descriptor stays platform-neutral — so this returns plain
 * `translateX`/`opacity` numbers the host wires into Reanimated
 * (`useAnimatedStyle` + `withSpring`), or applies instantly under reduced
 * motion. `from` is the off-screen start, `to` the resting state.
 */
export function panelSceneSlide(scene: PanelScene): {
	from: { translateX: number; opacity: number };
	to: { translateX: number; opacity: number };
} {
	const { enterOffset, exitOffset, replaceFade } = panelSceneMotion;
	switch (scene.kind) {
		case "close":
			return {
				from: { translateX: 0, opacity: 1 },
				to: { translateX: exitOffset, opacity: 0 },
			};
		case "replace":
			return {
				from: { translateX: enterOffset, opacity: replaceFade },
				to: { translateX: 0, opacity: 1 },
			};
		default:
			return {
				from: { translateX: enterOffset, opacity: 0 },
				to: { translateX: 0, opacity: 1 },
			};
	}
}
