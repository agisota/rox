import { ease, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "framer-motion";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { useRovingListNavigation } from "./useRovingListNavigation";

const ROW_HEIGHT = 44; // h-11
const OVERSCAN = 12;
/** Cap the entrance stagger so a long first page doesn't ripple for seconds. */
const MAX_STAGGER_INDEX = 8;
const STAGGER_STEP = 0.018; // 18ms — matches the spec list-row stagger

interface VirtualGithubListProps<T> {
	items: T[];
	getKey: (item: T) => string | number;
	renderRow: (item: T) => ReactNode;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onReachEnd: () => void;
	/**
	 * Enables j/k/Enter roving navigation. When provided, the list captures
	 * focus, tracks an active row, scrolls off-screen rows into view, and calls
	 * this on Enter (or on click of the active row). Omit for a non-interactive
	 * list.
	 */
	onActivate?: (item: T) => void;
}

/**
 * Virtualized PR/Issue list using the same @tanstack/react-virtual pattern as
 * TasksTableView (useVirtualizer + a scroll container + a spacer). Replaces the
 * unbounded `.map` so a 1000-PR repo stays at ~12 mounted rows.
 *
 * Infinite paging is driven by an "approaching the end" check on the virtual
 * window (rather than a separate IntersectionObserver sentinel, which a
 * virtualized list cannot keep mounted at the bottom).
 *
 * Initial mount runs a capped opacity/y stagger (essential tier). On scroll the
 * virtualizer remounts rows by index; the entrance only plays for the first
 * `MAX_STAGGER_INDEX` rows so re-scrolling never re-ripples the whole list.
 */
export function VirtualGithubList<T>({
	items,
	getKey,
	renderRow,
	hasNextPage,
	isFetchingNextPage,
	onReachEnd,
	onActivate,
}: VirtualGithubListProps<T>) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const shouldAnimate = useShouldAnimate("essential");

	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: OVERSCAN,
	});

	const virtualItems = virtualizer.getVirtualItems();

	const keyboardEnabled = onActivate != null;
	const scrollToIndex = useCallback(
		(index: number) => {
			// Align off-screen rows into the window so the active row is always
			// visible. The virtualizer mounts the row by index once scrolled.
			virtualizer.scrollToIndex(index, { align: "auto" });
		},
		[virtualizer],
	);
	const { activeIndex, setActiveIndex, onKeyDown } = useRovingListNavigation({
		itemCount: items.length,
		enabled: keyboardEnabled,
		scrollToIndex,
		onActivate: (index) => {
			const item = items[index];
			if (item !== undefined) onActivate?.(item);
		},
	});

	// Trigger the next page when the last virtual row enters the window. Done in
	// an effect (not during render) to avoid setState-in-render loops.
	const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
	useEffect(() => {
		if (hasNextPage && !isFetchingNextPage && lastIndex >= items.length - 1) {
			onReachEnd();
		}
	}, [lastIndex, hasNextPage, isFetchingNextPage, items.length, onReachEnd]);

	return (
		<div
			ref={scrollRef}
			className="flex-1 min-h-0 overflow-y-auto outline-none"
			tabIndex={keyboardEnabled ? 0 : -1}
			role="listbox"
			aria-activedescendant={
				keyboardEnabled && activeIndex >= 0
					? `github-row-${activeIndex}`
					: undefined
			}
			onKeyDown={keyboardEnabled ? onKeyDown : undefined}
		>
			<div
				style={{ height: virtualizer.getTotalSize() }}
				className="relative w-full"
			>
				{virtualItems.map((virtualRow) => {
					const item = items[virtualRow.index];
					const delay =
						shouldAnimate && virtualRow.index < MAX_STAGGER_INDEX
							? virtualRow.index * STAGGER_STEP
							: 0;
					const isActive = keyboardEnabled && virtualRow.index === activeIndex;
					return (
						<motion.div
							key={getKey(item)}
							id={`github-row-${virtualRow.index}`}
							data-index={virtualRow.index}
							role="option"
							aria-selected={isActive}
							className={cn(
								"absolute left-0 w-full",
								isActive && "bg-accent/60 ring-1 ring-inset ring-primary/40",
							)}
							onMouseEnter={
								keyboardEnabled
									? () => setActiveIndex(virtualRow.index)
									: undefined
							}
							// Position via `top` (not transform) so framer-motion's opacity
							// entrance can't fight the virtualizer's row offset. Opacity-only
							// entrance keeps the row coordinate stable under windowing.
							style={{ top: virtualRow.start }}
							initial={shouldAnimate ? { opacity: 0 } : false}
							animate={{ opacity: 1 }}
							transition={{
								duration: motionDuration.fast,
								ease: ease.standard,
								delay,
							}}
						>
							{renderRow(item)}
						</motion.div>
					);
				})}
			</div>
			{isFetchingNextPage && (
				<div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
					Загрузка ещё…
				</div>
			)}
		</div>
	);
}
