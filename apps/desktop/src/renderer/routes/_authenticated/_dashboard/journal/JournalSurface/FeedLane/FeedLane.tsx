import type { SelectJournalEvent } from "@rox/db/schema";
import { useCallback, useMemo, useRef, useState } from "react";
import { GroupedVirtuoso, type GroupedVirtuosoHandle } from "react-virtuoso";
import { dayKeyOf, groupLabel } from "../datetime";
import type { FeedKindFilter, FeedStatusFilter, JournalSearch } from "../types";
import { eventMatchesFilters } from "../types";
import { EventDrawer } from "./EventDrawer";
import { FeedFilterBar } from "./FeedFilterBar";
import { FeedRow } from "./FeedRow";
import { FeedEmpty, FeedFilterEmpty, FeedSkeleton } from "./FeedStates";

interface FeedLaneProps {
	/** Newest-first events (already sorted by the surface). */
	events: SelectJournalEvent[];
	isReady: boolean;
	search: JournalSearch;
	onSearchChange: (patch: Partial<JournalSearch>) => void;
}

interface DayGroup {
	dayKey: string;
	label: string;
	events: SelectJournalEvent[];
}

/**
 * The continuous event lane: a day-grouped, virtualized timeline. Uses
 * react-virtuoso's GroupedVirtuoso for sticky day headers + windowed rendering
 * (thousands of rows without lag) and a continuous timeline line drawn per
 * group. Filtering is client-side over the already-synced Electric collection.
 */
export function FeedLane({
	events,
	isReady,
	search,
	onSearchChange,
}: FeedLaneProps) {
	const virtuosoRef = useRef<GroupedVirtuosoHandle>(null);
	const [activeEvent, setActiveEvent] = useState<SelectJournalEvent | null>(
		null,
	);

	const kind: FeedKindFilter = search.kind ?? "all";
	const status: FeedStatusFilter = search.status ?? "all";
	const query = search.q ?? "";

	const filtered = useMemo(
		() => events.filter((e) => eventMatchesFilters(e, kind, status, query)),
		[events, kind, status, query],
	);

	// Group the (already newest-first) events into contiguous UTC-day buckets.
	const groups = useMemo<DayGroup[]>(() => {
		const out: DayGroup[] = [];
		let current: DayGroup | null = null;
		for (const event of filtered) {
			const dayKey = dayKeyOf(event.createdAt);
			if (!current || current.dayKey !== dayKey) {
				current = { dayKey, label: groupLabel(dayKey), events: [] };
				out.push(current);
			}
			current.events.push(event);
		}
		return out;
	}, [filtered]);

	const groupCounts = useMemo(
		() => groups.map((g) => g.events.length),
		[groups],
	);

	// Flat index → event lookup for itemContent (Virtuoso passes a flat index).
	const flatEvents = useMemo(() => filtered, [filtered]);

	// Pulse the dot on the very newest few rows so live inserts read as "fresh".
	const recentIds = useMemo(
		() => new Set(flatEvents.slice(0, 3).map((e) => e.id)),
		[flatEvents],
	);

	const itemContent = useCallback(
		(index: number) => {
			const event = flatEvents[index];
			if (!event) return null;
			return (
				<FeedRow
					event={event}
					pulse={recentIds.has(event.id)}
					onOpen={setActiveEvent}
				/>
			);
		},
		[flatEvents, recentIds],
	);

	const groupContent = useCallback(
		(index: number) => {
			const group = groups[index];
			if (!group) return null;
			return (
				<div className="glass py-2">
					<h3 className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
						{group.label}
					</h3>
				</div>
			);
		},
		[groups],
	);

	// Cache-first: skeleton only when genuinely empty AND not yet ready.
	if (events.length === 0 && !isReady) {
		return <FeedSkeleton />;
	}

	const hasActiveFilters = kind !== "all" || status !== "all" || query !== "";

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="sticky top-0 z-10">
				<FeedFilterBar
					kind={kind}
					status={status}
					query={query}
					onKindChange={(next) =>
						onSearchChange({ kind: next === "all" ? undefined : next })
					}
					onStatusChange={(next) =>
						onSearchChange({ status: next === "all" ? undefined : next })
					}
					onQueryChange={(next) =>
						onSearchChange({ q: next === "" ? undefined : next })
					}
				/>
			</div>

			{filtered.length === 0 ? (
				hasActiveFilters ? (
					<FeedFilterEmpty
						onReset={() =>
							onSearchChange({
								kind: undefined,
								status: undefined,
								q: undefined,
							})
						}
					/>
				) : (
					<FeedEmpty />
				)
			) : (
				<div className="relative min-h-0 flex-1 pt-3">
					{/* Continuous timeline line behind the rows. */}
					<span
						className="pointer-events-none absolute top-3 bottom-0 left-3 w-px bg-border/50"
						aria-hidden
					/>
					<GroupedVirtuoso
						ref={virtuosoRef}
						className="h-full"
						groupCounts={groupCounts}
						groupContent={groupContent}
						itemContent={itemContent}
						increaseViewportBy={400}
						overscan={600}
						// Keep scroll position stable when new events prepend at the top
						// (Electric live-query insert) instead of jumping to the newest.
						followOutput={false}
					/>
				</div>
			)}

			<EventDrawer event={activeEvent} onClose={() => setActiveEvent(null)} />
		</div>
	);
}
