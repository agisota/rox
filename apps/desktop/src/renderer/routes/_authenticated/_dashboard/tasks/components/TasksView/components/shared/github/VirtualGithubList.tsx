import { ease, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "framer-motion";
import { type ReactNode, useEffect, useRef } from "react";

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

	// Trigger the next page when the last virtual row enters the window. Done in
	// an effect (not during render) to avoid setState-in-render loops.
	const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
	useEffect(() => {
		if (hasNextPage && !isFetchingNextPage && lastIndex >= items.length - 1) {
			onReachEnd();
		}
	}, [lastIndex, hasNextPage, isFetchingNextPage, items.length, onReachEnd]);

	return (
		<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
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
					return (
						<motion.div
							key={getKey(item)}
							data-index={virtualRow.index}
							className="absolute left-0 w-full"
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
