import type { SelectJournalEntry, SelectJournalEvent } from "@rox/db/schema";
import { AnimatedPresence } from "@rox/ui/motion";
import { Tabs, TabsList, TabsTrigger } from "@rox/ui/tabs";
import { cn } from "@rox/ui/utils";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
import { DashboardSurface } from "renderer/components/DashboardSurface";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { DaySummaryRail } from "./DaySummaryRail";
import { FeedLane } from "./FeedLane";
import { ReflectionLane } from "./ReflectionLane";
import type { JournalSearch, JournalTab } from "./types";

interface JournalSurfaceProps {
	search: JournalSearch;
	onSearchChange: (patch: Partial<JournalSearch>) => void;
}

/**
 * Journal surface — the activity/run timeline + daily AI reflection. Two lanes
 * over two read-only Electric collections (`journalEvents` / `journalEntries`),
 * filtered to the signed-in user, rendered cache-first. The feed lane is a
 * day-grouped virtualized timeline; the reflection lane keeps the brand
 * typography and adds regenerate + history paging. A sticky "Сводка дня" rail
 * sits alongside on wide widths and collapses to a horizontal strip below 1024px.
 *
 * Layout goes through the canonical `DashboardSurface` (bare escape hatch) so
 * width uses the shared `max-w-content` token — never a per-surface max-w-5xl —
 * while this surface owns the bounded-height flex column the virtualizer needs.
 */
export function JournalSurface({
	search,
	onSearchChange,
}: JournalSurfaceProps) {
	const collections = useCollections();
	const queryClient = useQueryClient();
	const trpc = useTRPC();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? "";
	const [refreshing, setRefreshing] = useState(false);

	const tab: JournalTab = search.tab ?? "feed";

	// Lane 1 — once-daily reflection (journal_entries).
	const { data: entries = [], isReady: entriesReady } = useLiveQuery(
		(q) =>
			q
				.from({ journalEntries: collections.journalEntries })
				.where(({ journalEntries }) => eq(journalEntries.createdBy, userId)),
		[collections, userId],
	);

	// Lane 2 — continuous event stream (journal_events).
	const { data: events = [], isReady: eventsReady } = useLiveQuery(
		(q) =>
			q
				.from({ journalEvents: collections.journalEvents })
				.where(({ journalEvents }) => eq(journalEvents.createdBy, userId)),
		[collections, userId],
	);

	// Newest day first (sort client-side so we never depend on collection order).
	const sortedEntries = useMemo(
		() =>
			[...entries].sort((a, b) =>
				a.day < b.day ? 1 : a.day > b.day ? -1 : 0,
			) as SelectJournalEntry[],
		[entries],
	);

	// Newest event first.
	const sortedEvents = useMemo(
		() =>
			[...events].sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			) as SelectJournalEvent[],
		[events],
	);

	const handleRefresh = async () => {
		setRefreshing(true);
		try {
			// Electric collections self-sync; the manual refresh re-pulls the cloud
			// history query that backs deep pagination.
			await queryClient.invalidateQueries({
				queryKey: trpc.journal.list.queryKey(),
			});
		} finally {
			// Keep the spin visible briefly so the action reads as deliberate.
			setTimeout(() => setRefreshing(false), 400);
		}
	};

	return (
		<DashboardSurface bare>
			<div className="mx-auto flex h-full w-full max-w-content flex-col px-6 py-6">
				<header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<h1 className="font-semibold text-2xl text-foreground">Журнал</h1>
						<p className="mt-1 text-muted-foreground text-sm">
							Ежедневная рефлексия и непрерывная лента событий
						</p>
					</div>

					<div className="flex shrink-0 items-center gap-2">
						<Tabs
							value={tab}
							onValueChange={(value) =>
								onSearchChange({ tab: value as JournalTab })
							}
						>
							<TabsList className="rounded-full border border-border/60 bg-card/40 backdrop-blur-sm">
								<TabsTrigger value="feed" className="rounded-full">
									Лента
								</TabsTrigger>
								<TabsTrigger value="reflection" className="rounded-full">
									Рефлексия
								</TabsTrigger>
							</TabsList>
						</Tabs>
						<button
							type="button"
							onClick={handleRefresh}
							disabled={refreshing}
							aria-label="Обновить"
							className="inline-flex size-8 items-center justify-center rounded-full border border-border/60 bg-card/40 text-muted-foreground backdrop-blur-sm transition-colors hover:border-border hover:text-foreground disabled:opacity-60"
						>
							<LuRefreshCw
								className={cn("size-4", refreshing && "animate-spin")}
							/>
						</button>
					</div>
				</header>

				{/* Collapsed summary strip for <1024px. */}
				<div className="mb-3 lg:hidden">
					<DaySummaryRail events={sortedEvents} variant="bar" />
				</div>

				<div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
					<div className="flex min-h-0 min-w-0 flex-col">
						<AnimatedPresence mode="wait" initial={false}>
							{tab === "feed" ? (
								<LaneFade key="feed">
									<FeedLane
										events={sortedEvents}
										isReady={eventsReady}
										search={search}
										onSearchChange={onSearchChange}
									/>
								</LaneFade>
							) : (
								<LaneFade key="reflection">
									{/* Reflection text caps narrower for readability. */}
									<div className="h-full overflow-y-auto">
										<div className="mx-auto max-w-3xl">
											<ReflectionLane
												entries={sortedEntries}
												isReady={entriesReady}
											/>
										</div>
									</div>
								</LaneFade>
							)}
						</AnimatedPresence>
					</div>

					<DaySummaryRail events={sortedEvents} variant="rail" />
				</div>
			</div>
		</DashboardSurface>
	);
}

/**
 * Crossfade wrapper for the lane switch (essential tier — conveys the tab
 * change). The app's MotionConfig (`MotionRoot`) honours reduce-motion globally,
 * so this short opacity tween collapses to an instant swap under reduced motion.
 */
function LaneFade({ children }: { children: React.ReactNode }) {
	return (
		<motion.div
			className="flex min-h-0 flex-1 flex-col"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
		>
			{children}
		</motion.div>
	);
}
