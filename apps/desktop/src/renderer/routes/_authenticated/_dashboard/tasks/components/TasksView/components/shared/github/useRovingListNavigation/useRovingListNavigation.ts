import { useCallback, useEffect, useState } from "react";
import { rovingKeyAction } from "./rovingKeyAction";

export interface RovingListNavigation {
	/** Index of the currently focused row, or -1 when nothing is focused. */
	activeIndex: number;
	/** Imperatively set the active row (e.g. on hover or click). */
	setActiveIndex: (index: number) => void;
	/** Keydown handler to spread onto the scroll container. */
	onKeyDown: (event: React.KeyboardEvent) => void;
}

interface UseRovingListNavigationOptions {
	/** Total number of rows in the list. */
	itemCount: number;
	/** Whether keyboard navigation is active (false → inert). */
	enabled: boolean;
	/** Scroll a row into view (wired to the virtualizer's scrollToIndex). */
	scrollToIndex: (index: number) => void;
	/** Invoked on Enter when a row is focused. */
	onActivate: (index: number) => void;
}

/**
 * Headless j/k/Enter roving-focus controller for a virtualized list.
 *
 * Platform-neutral: it owns only the active index + key semantics and delegates
 * the actual scroll-into-view to the caller (so a virtualized list can
 * `scrollToIndex` off-screen rows into the window before the row element even
 * exists). `j`/`ArrowDown` move down, `k`/`ArrowUp` move up, `Enter` activates,
 * `Home`/`End` jump to the edges. The index is clamped to `[0, itemCount-1]`
 * and reset when the list shrinks past it.
 */
export function useRovingListNavigation({
	itemCount,
	enabled,
	scrollToIndex,
	onActivate,
}: UseRovingListNavigationOptions): RovingListNavigation {
	const [activeIndex, setActiveIndexState] = useState(-1);

	// Keep the active index valid when the list length changes (filter/paging).
	useEffect(() => {
		if (activeIndex >= itemCount) {
			setActiveIndexState(itemCount > 0 ? itemCount - 1 : -1);
		}
	}, [itemCount, activeIndex]);

	const setActiveIndex = useCallback((index: number) => {
		setActiveIndexState(index);
	}, []);

	const move = useCallback(
		(next: number) => {
			if (itemCount === 0) return;
			const clamped = Math.max(0, Math.min(itemCount - 1, next));
			setActiveIndexState(clamped);
			scrollToIndex(clamped);
		},
		[itemCount, scrollToIndex],
	);

	const onKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (!enabled || itemCount === 0) return;
			const action = rovingKeyAction(event.key, activeIndex, itemCount);
			if (action.type === "none") return;
			event.preventDefault();
			if (action.type === "move") {
				move(action.index);
			} else {
				onActivate(action.index);
			}
		},
		[enabled, itemCount, activeIndex, move, onActivate],
	);

	return { activeIndex, setActiveIndex, onKeyDown };
}
