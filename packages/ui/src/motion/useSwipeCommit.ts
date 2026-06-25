import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useRef,
	useState,
} from "react";
import {
	gestureFollowThrough,
	resolveSwipe,
	type SwipeResolution,
} from "./GestureGrammar";
import { useMotionPreference } from "./useMotionPreference";

/**
 * Web / desktop swipe-to-commit hook — case 051 / PR-51 (#646).
 *
 * Wires a list row's pointer events to the shared gesture grammar
 * ({@link resolveSwipe}) so a horizontal pan reveals the action affordance at
 * stage one and commits (archive / delete / quick-tag) at stage two — using the
 * exact same thresholds the RN list gestures read, with no per-platform magic
 * numbers. The follow-through honours the energy contract: under reduced / off
 * energy the commit still fires but the row snaps to its final state instead of
 * springing ({@link gestureFollowThrough}).
 *
 * The hook is platform-agnostic React: it touches only the Pointer Events API,
 * so it backs both the web app and the desktop (Electron) list rows. It returns
 * the live {@link SwipeResolution} (for rendering the affordance / chip targets)
 * plus pointer handlers to spread onto the row.
 */
export interface UseSwipeCommitOptions {
	/** Run the primary action when a swipe commits. Receives the swipe direction. */
	onCommit: (resolution: SwipeResolution) => void;
	/**
	 * Quick-tag chip count exposed at stage two of a two-stage swipe. When the
	 * release lands on a chip target, {@link onQuickTag} fires instead of the
	 * primary action so tagging happens without leaving the list.
	 */
	chipCount?: number;
	/** Run when a commit release lands on quick-tag chip index `i` (0-based). */
	onQuickTag?: (chipIndex: number, resolution: SwipeResolution) => void;
}

export interface UseSwipeCommitResult {
	/** Live resolved swipe state — drive the affordance / chip targets off this. */
	resolution: SwipeResolution;
	/** Whether a committed swipe should spring (`true`) or snap to its end state. */
	followThrough: "spring" | "snap";
	/** Spread onto the swipeable row. */
	handlers: {
		onPointerDown: (event: ReactPointerEvent) => void;
		onPointerMove: (event: ReactPointerEvent) => void;
		onPointerUp: (event: ReactPointerEvent) => void;
		onPointerCancel: () => void;
	};
}

const IDLE: SwipeResolution = {
	stage: "idle",
	direction: "trailing",
	willCommit: false,
	chipTargets: [],
};

/** Index of the chip target the release offset lands on, or `null`. */
function chipIndexAt(
	resolution: SwipeResolution,
	offset: number,
): number | null {
	const i = resolution.chipTargets.findIndex(
		(t) => offset >= t.start && offset < t.end,
	);
	return i === -1 ? null : i;
}

export function useSwipeCommit(
	options: UseSwipeCommitOptions,
): UseSwipeCommitResult {
	const { onCommit, onQuickTag, chipCount } = options;
	const preference = useMotionPreference();
	const [resolution, setResolution] = useState<SwipeResolution>(IDLE);
	const startX = useRef<number | null>(null);
	const lastX = useRef(0);
	const lastT = useRef(0);

	const onPointerDown = useCallback((event: ReactPointerEvent) => {
		startX.current = event.clientX;
		lastX.current = event.clientX;
		lastT.current = event.timeStamp;
		event.currentTarget.setPointerCapture?.(event.pointerId);
	}, []);

	const onPointerMove = useCallback(
		(event: ReactPointerEvent) => {
			if (startX.current === null) return;
			const dx = event.clientX - startX.current;
			const dt = event.timeStamp - lastT.current;
			// px/s; guard against a zero dt frame.
			const vx = dt > 0 ? ((event.clientX - lastX.current) / dt) * 1000 : 0;
			lastX.current = event.clientX;
			lastT.current = event.timeStamp;
			setResolution(resolveSwipe({ dx, vx }, { chipCount }));
		},
		[chipCount],
	);

	const finish = useCallback(
		(event: ReactPointerEvent) => {
			if (startX.current === null) return;
			const dx = event.clientX - startX.current;
			const final = resolveSwipe({ dx, vx: 0 }, { chipCount });
			if (final.willCommit) {
				const offset = Math.abs(dx);
				const chip = chipIndexAt(final, offset);
				if (chip !== null && onQuickTag) {
					onQuickTag(chip, final);
				} else {
					onCommit(final);
				}
			}
			startX.current = null;
			setResolution(IDLE);
		},
		[chipCount, onCommit, onQuickTag],
	);

	const onPointerCancel = useCallback(() => {
		startX.current = null;
		setResolution(IDLE);
	}, []);

	return {
		resolution,
		followThrough: gestureFollowThrough(preference),
		handlers: {
			onPointerDown,
			onPointerMove,
			onPointerUp: finish,
			onPointerCancel,
		},
	};
}
