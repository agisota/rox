import { gestureGrammar } from "./tokens";
import { type MotionPreference, shouldAnimate } from "./useMotionPreference";

/**
 * Shared gesture grammar — case 051 / PR-51 (#646).
 *
 * The single, platform-neutral source of truth for the touch/pointer gestures
 * every Rox surface speaks. It names *what* a gesture means (swipe-to-commit,
 * pan-resize, edge-swipe, long-press) and resolves a live pan/press against the
 * shared {@link gestureGrammar} thresholds — without importing any platform
 * mechanism. Each surface maps the resolved result to its native primitive:
 *
 * - **Web** → pointer events / vaul drawer drag; the F05 drawer pan reads
 *   {@link resolveSwipe} / {@link resolvePanResize}.
 * - **Desktop** → pane pan-resize reads {@link resolvePanResize}.
 * - **Mobile (RN)** → `react-native-gesture-handler` `Pan`/`LongPress`
 *   recognizers feed their translation/duration into the same resolvers, then
 *   drive Reanimated; RN is *not* imported here so the grammar stays neutral.
 *
 * Every resolver returns whether the follow-through motion is allowed for the
 * current energy contract ({@link energyAllowsGestureMotion}). The *commit*
 * itself is functional and always fires regardless of energy; only the
 * animated follow-through is gated, so reduced / off energy snaps to the final
 * state instead of springing to it.
 */

/** The kinds of gesture the shared grammar recognises. */
export type GestureKind = "swipe" | "panResize" | "edgeSwipe" | "longPress";

/**
 * The two-stage swipe progression. `idle` → no affordance shown; `preview` →
 * the action background / quick-tag chip targets are revealed but releasing
 * does nothing; `commit` → releasing runs the primary action.
 */
export type SwipeStage = "idle" | "preview" | "commit";

/** Direction a swipe / edge-swipe travels along its axis. */
export type GestureDirection = "leading" | "trailing";

/** A live swipe sample: signed pan distance (px) and velocity (px/s). */
export interface SwipeSample {
	/** Signed horizontal pan distance (px); sign encodes direction. */
	dx: number;
	/** Signed horizontal velocity (px/s) at the sample instant. */
	vx: number;
}

/** Resolved swipe state mapped from a {@link SwipeSample}. */
export interface SwipeResolution {
	/** Which of the two stages the swipe is currently in. */
	stage: SwipeStage;
	/** Direction the swipe travels (sign of `dx`). */
	direction: GestureDirection;
	/** Whether releasing now would commit the primary action. */
	willCommit: boolean;
	/**
	 * Quick-tag chip targets exposed at stage two of a two-stage swipe. Each
	 * entry is the chip's `[start, end]` offset (px) from the swiped edge, so
	 * the host can hit-test a release against a chip without leaving the list.
	 * Empty unless `stage === "commit"` and `chipCount > 0`.
	 */
	chipTargets: Array<{ start: number; end: number }>;
}

/** Whether the resolved energy contract allows animated gesture follow-through. */
export function energyAllowsGestureMotion(animate?: boolean): boolean {
	// Gestures are essential-tier: the action conveys state, so the
	// follow-through rides the essential tier rather than the decorative one.
	return animate ?? shouldAnimate("essential");
}

/** Direction implied by a signed pan distance. */
function directionOf(distance: number): GestureDirection {
	return distance < 0 ? "leading" : "trailing";
}

/**
 * Resolve a live swipe sample against the shared grammar. Optionally exposes
 * `chipCount` quick-tag chip targets once the swipe reaches the commit stage,
 * laid out from the swiped edge using {@link gestureGrammar.swipe.quickTagChipWidth}.
 *
 * `animate` lets a React caller pass an already-read `useShouldAnimate` value;
 * the follow-through gating it implies is surfaced via
 * {@link energyAllowsGestureMotion}, not baked into the resolution, so the
 * commit decision is identical across energy modes.
 */
export function resolveSwipe(
	sample: SwipeSample,
	options: { chipCount?: number } = {},
): SwipeResolution {
	const {
		previewThreshold,
		commitThreshold,
		velocityCommit,
		quickTagChipWidth,
	} = gestureGrammar.swipe;
	const distance = Math.abs(sample.dx);
	const velocity = Math.abs(sample.vx);

	const willCommit = distance >= commitThreshold || velocity >= velocityCommit;
	let stage: SwipeStage = "idle";
	if (willCommit) {
		stage = "commit";
	} else if (distance >= previewThreshold) {
		stage = "preview";
	}

	const chipCount = options.chipCount ?? 0;
	const chipTargets =
		stage === "commit" && chipCount > 0
			? Array.from({ length: chipCount }, (_, i) => ({
					start: i * quickTagChipWidth,
					end: (i + 1) * quickTagChipWidth,
				}))
			: [];

	return {
		stage,
		direction: directionOf(sample.dx),
		willCommit,
		chipTargets,
	};
}

/**
 * Resolve a pan-resize drag to its clamped/snapped final dimension. `size` is
 * the dragged-to dimension (px); the result is clamped to
 * `[minSize, maxSize]`, snapped to any provided rail within `snapThreshold`,
 * and flagged `collapsed` when it falls below `collapseThreshold`. `snapRails`
 * are optional preferred dimensions (e.g. a sidebar's icon-rail / expanded
 * widths) the drag magnetises toward.
 */
export function resolvePanResize(
	size: number,
	options: { snapRails?: readonly number[] } = {},
): { size: number; collapsed: boolean; snappedTo: number | null } {
	const { minSize, maxSize, snapThreshold, collapseThreshold } =
		gestureGrammar.panResize;

	if (size < collapseThreshold) {
		return { size: minSize, collapsed: true, snappedTo: null };
	}

	const clamped = Math.min(Math.max(size, minSize), maxSize);

	let snappedTo: number | null = null;
	let best: number = snapThreshold;
	for (const rail of options.snapRails ?? []) {
		const delta = Math.abs(clamped - rail);
		if (delta <= best) {
			best = delta;
			snappedTo = rail;
		}
	}

	return {
		size: snappedTo ?? clamped,
		collapsed: false,
		snappedTo,
	};
}

/**
 * Whether a pointer-down at `offsetFromEdge` (px) starts an edge-swipe — i.e.
 * lands inside the {@link gestureGrammar.edgeSwipe.edgeWidth} hot zone.
 */
export function isEdgeSwipeStart(offsetFromEdge: number): boolean {
	return (
		offsetFromEdge >= 0 && offsetFromEdge <= gestureGrammar.edgeSwipe.edgeWidth
	);
}

/**
 * Resolve a live edge-swipe drag: progress is `0..1` toward the open threshold,
 * `willOpen` is whether releasing now completes the open.
 */
export function resolveEdgeSwipe(dx: number): {
	progress: number;
	direction: GestureDirection;
	willOpen: boolean;
} {
	const { openThreshold } = gestureGrammar.edgeSwipe;
	const distance = Math.abs(dx);
	return {
		progress: Math.min(distance / openThreshold, 1),
		direction: directionOf(dx),
		willOpen: distance >= openThreshold,
	};
}

/**
 * Long-press recogniser config the host wires into its platform primitive
 * (web `pointerdown` timer / RN `LongPress` recognizer). Pulls the shared
 * timing so press-and-hold feels identical everywhere.
 */
export function longPressConfig(): {
	durationMs: number;
	moveTolerancePx: number;
} {
	return {
		durationMs: gestureGrammar.longPress.duration,
		moveTolerancePx: gestureGrammar.longPress.moveTolerance,
	};
}

/**
 * Whether a long-press is still valid given how far the pointer has drifted
 * during the hold. Past {@link gestureGrammar.longPress.moveTolerance} the hold
 * is treated as a pan/scroll and the press cancels.
 */
export function longPressHolds(drift: number): boolean {
	return Math.abs(drift) <= gestureGrammar.longPress.moveTolerance;
}

/**
 * Map the resolved energy contract to how a surface should run a committed
 * gesture's follow-through. `"spring"` → animate to the final state; `"snap"` →
 * jump to it (reduced / off energy). The commit fires either way.
 */
export function gestureFollowThrough(
	preferenceOrAnimate?: MotionPreference | boolean,
): "spring" | "snap" {
	if (typeof preferenceOrAnimate === "boolean") {
		return preferenceOrAnimate ? "spring" : "snap";
	}
	if (preferenceOrAnimate === "off" || preferenceOrAnimate === "essential") {
		// A gesture's commit is already meaning-bearing on its own; the spring
		// follow-through is the decorative part, so both essential and off snap.
		return "snap";
	}
	return energyAllowsGestureMotion() ? "spring" : "snap";
}
