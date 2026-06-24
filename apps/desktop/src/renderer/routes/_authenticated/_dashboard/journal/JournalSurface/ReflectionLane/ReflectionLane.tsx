import type { SelectJournalEntry } from "@rox/db/schema";
import { Button } from "@rox/ui/button";
import { MotionList, MotionListItem } from "@rox/ui/motion";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { SpringInCard } from "../SpringInCard";
import { ReflectionDay } from "./ReflectionDay";
import { ReflectionSkeleton } from "./ReflectionStates";

interface ReflectionLaneProps {
	/** Live Electric entries (newest day first) — the primary, real-time source. */
	entries: SelectJournalEntry[];
	isReady: boolean;
}

/**
 * The once-daily reflection lane. The live Electric window is the primary
 * source; "Показать историю" pages deeper through server history via
 * `journalRouter.list` (cursor by `day`) and merges older days in, deduped by
 * `day`. Writes never happen here — entries are server-generated (read-only on
 * the client).
 */
export function ReflectionLane({ entries, isReady }: ReflectionLaneProps) {
	const trpc = useTRPC();
	const [loadHistory, setLoadHistory] = useState(false);

	const history = useInfiniteQuery({
		...trpc.journal.list.infiniteQueryOptions(
			{ limit: 30 },
			{
				getNextPageParam: (lastPage: { nextCursor?: string }) =>
					lastPage.nextCursor,
			},
		),
		// Only reach for server history once the user asks for it.
		enabled: loadHistory,
	});

	// Merge live entries with any paged history, deduped by `day`, newest first.
	const merged = useMemo(() => {
		const byDay = new Map<string, SelectJournalEntry>();
		for (const entry of entries) byDay.set(entry.day, entry);
		const pages = history.data?.pages ?? [];
		for (const page of pages) {
			for (const entry of page.entries as SelectJournalEntry[]) {
				if (!byDay.has(entry.day)) byDay.set(entry.day, entry);
			}
		}
		return [...byDay.values()].sort((a, b) =>
			a.day < b.day ? 1 : a.day > b.day ? -1 : 0,
		);
	}, [entries, history.data]);

	// Cache-first: skeleton only when genuinely empty AND not yet ready.
	if (merged.length === 0 && !isReady) {
		return <ReflectionSkeleton />;
	}

	if (merged.length === 0) {
		return <ReflectionEmpty />;
	}

	const canLoadMore = !loadHistory || history.hasNextPage;

	return (
		<div className="space-y-12">
			<MotionList className="space-y-12">
				{merged.map((entry) => (
					<MotionListItem key={entry.id}>
						<ReflectionDay entry={entry} />
					</MotionListItem>
				))}
			</MotionList>

			<div className="flex flex-col items-center gap-2 pb-4">
				{history.isError && (
					<p className="text-muted-foreground text-xs">
						Не удалось загрузить историю
					</p>
				)}
				{canLoadMore && (
					<Button
						variant="ghost"
						size="sm"
						className="text-muted-foreground hover:text-foreground"
						disabled={history.isFetching}
						onClick={() => {
							if (!loadHistory) {
								setLoadHistory(true);
								return;
							}
							void history.fetchNextPage();
						}}
					>
						{history.isFetching
							? "Загрузка…"
							: history.isError
								? "Повторить"
								: "Показать историю"}
					</Button>
				)}
			</div>
		</div>
	);
}

/** Ready-but-empty reflection — exact RU copy preserved from the legacy surface. */
function ReflectionEmpty() {
	return (
		<SpringInCard className="flex flex-col items-center justify-center rounded-lg border border-border/60 border-dashed bg-card/20 py-20 text-center">
			<span className="text-foreground text-sm">Журнал пока пуст</span>
			<span className="mt-1 max-w-sm text-muted-foreground text-xs">
				Записи появляются автоматически: каждый день Rox R1 разбирает твои
				сессии и собирает рефлексию, выводы и советы.
			</span>
		</SpringInCard>
	);
}
