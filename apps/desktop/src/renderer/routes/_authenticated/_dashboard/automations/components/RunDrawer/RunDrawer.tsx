import type { SelectAutomation, SelectAutomationRun } from "@rox/db/schema";
import { Accordion } from "@rox/ui/accordion";
import { Button } from "@rox/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@rox/ui/empty";
import { ease, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@rox/ui/sheet";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuListX, LuRefreshCw } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import {
	matchesFilter,
	RUN_FILTER_LABEL,
	type RunFilter,
} from "../../lib/runStatus";
import { RunRow } from "./RunRow";

/** listRuns has no cursor; we grow the limit toward the backend cap (100). */
const PAGE_SIZE = 30;
const MAX_LIMIT = 100;
const FILTERS: RunFilter[] = ["all", "success", "failure", "pending"];

interface RunDrawerProps {
	automation: SelectAutomation;
	/** machineId -> display name, resolved by the caller from Electric. */
	hostNames?: Map<string, string>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function RunDrawer({
	automation,
	hostNames,
	open,
	onOpenChange,
}: RunDrawerProps) {
	const queryClient = useQueryClient();
	const animate = useShouldAnimate("essential");
	const [limit, setLimit] = useState(PAGE_SIZE);
	const [filter, setFilter] = useState<RunFilter>("all");
	const [rerunningId, setRerunningId] = useState<string | null>(null);
	const sentinelRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);

	const runsQueryKey = useMemo(
		() => ["automation-runs", automation.id, limit] as const,
		[automation.id, limit],
	);

	const {
		data: runs = [],
		isLoading,
		isFetching,
		refetch,
	} = useQuery({
		queryKey: runsQueryKey,
		queryFn: () =>
			apiTrpcClient.automation.listRuns.query({
				automationId: automation.id,
				limit,
			}),
		enabled: open,
	});

	// Reset paging/filter each time the drawer closes for a clean slate.
	useEffect(() => {
		if (!open) {
			setLimit(PAGE_SIZE);
			setFilter("all");
		}
	}, [open]);

	const hasMore = runs.length >= limit && limit < MAX_LIMIT;

	// Infinite-scroll sentinel: grow the limit when the bottom comes into view.
	useEffect(() => {
		const el = sentinelRef.current;
		const root = scrollRef.current;
		if (!open || !el || !root || !hasMore || isFetching) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					setLimit((l) => Math.min(l + PAGE_SIZE, MAX_LIMIT));
				}
			},
			{ root, rootMargin: "120px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [open, hasMore, isFetching]);

	const handleRerun = (run: SelectAutomationRun) => {
		setRerunningId(run.id);
		// Rerun reuses runNow (idempotent: automation_runs_dedup_idx on
		// (automationId, scheduledFor) + onConflictDoNothing). It intentionally
		// does NOT move next_run_at, matching dispatch.ts semantics.
		toast.promise(
			apiTrpcClient.automation.runNow
				.mutate({ id: automation.id })
				.finally(() => setRerunningId(null)),
			{
				loading: "Повторный запуск…",
				success: () => {
					// Pull the freshly-created run into view (all limit variants).
					queryClient.invalidateQueries({
						queryKey: ["automation-runs", automation.id],
					});
					return "Запуск повторён";
				},
				error: (err) => {
					if (!(err instanceof Error)) return "Не удалось повторить запуск";
					if (err.message.includes("in progress"))
						return "Запуск уже выполняется";
					if (err.message.includes("offline")) return "Устройство офлайн";
					return err.message;
				},
			},
		);
	};

	const filtered = useMemo(
		() => runs.filter((run) => matchesFilter(run.status, filter)),
		[runs, filter],
	);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="w-full gap-0 p-0 sm:max-w-xl"
				aria-describedby={undefined}
			>
				<SheetHeader className="border-b border-border px-5 py-4">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<SheetTitle className="truncate text-sm">Все запуски</SheetTitle>
							<SheetDescription className="truncate text-xs">
								{automation.name}
							</SheetDescription>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="mr-8 shrink-0"
							aria-label="Обновить"
							disabled={isFetching}
							onClick={() => refetch()}
						>
							<LuRefreshCw
								className={cn("size-4", isFetching && "animate-spin")}
							/>
						</Button>
					</div>

					<div className="mt-1 flex items-center gap-1">
						{FILTERS.map((value) => (
							<button
								key={value}
								type="button"
								onClick={() => setFilter(value)}
								className={cn(
									"rounded-full px-2.5 py-1 text-xs transition-colors",
									filter === value
										? "bg-accent text-foreground"
										: "text-muted-foreground hover:bg-accent/50",
								)}
							>
								{RUN_FILTER_LABEL[value]}
							</button>
						))}
					</div>
				</SheetHeader>

				<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
					<div className="flex flex-col gap-1.5 p-4">
						{isLoading ? (
							<RunSkeleton />
						) : filtered.length === 0 ? (
							<Empty className="py-16">
								<EmptyHeader>
									<EmptyMedia
										variant="icon"
										className="size-12 [&_svg:not([class*='size-'])]:size-6"
									>
										<LuListX />
									</EmptyMedia>
									<EmptyTitle>
										{filter === "all"
											? "Запусков ещё нет"
											: "Нет запусков по фильтру"}
									</EmptyTitle>
									<EmptyDescription>
										{filter === "all"
											? "Когда автоматизация сработает, запуски появятся здесь."
											: "Попробуйте другой фильтр статуса."}
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							<Accordion
								type="single"
								collapsible
								className="flex flex-col gap-1.5"
							>
								<AnimatePresence initial={false}>
									{filtered.map((run, index) => (
										<motion.div
											key={run.id}
											layout
											initial={animate ? { opacity: 0, y: 6 } : false}
											animate={{ opacity: 1, y: 0 }}
											exit={animate ? { opacity: 0, y: -6 } : undefined}
											transition={{
												duration: motionDuration.fast,
												ease: ease.standard,
												delay: animate ? Math.min(index, 9) * 0.03 : 0,
											}}
										>
											<RunRow
												run={run}
												timezone={automation.timezone}
												hostName={
													run.hostId ? hostNames?.get(run.hostId) : undefined
												}
												rerunning={rerunningId === run.id}
												onRerun={handleRerun}
											/>
										</motion.div>
									))}
								</AnimatePresence>
							</Accordion>
						)}

						{hasMore && (
							<div
								ref={sentinelRef}
								className="flex items-center justify-center py-3 text-xs text-muted-foreground"
							>
								{isFetching ? "Загрузка…" : ""}
							</div>
						)}
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}

function RunSkeleton() {
	return (
		<div className="flex flex-col gap-1.5">
			{Array.from({ length: 6 }).map((_, i) => (
				<Skeleton
					// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
					key={i}
					className="h-12 w-full rounded-md"
				/>
			))}
		</div>
	);
}
