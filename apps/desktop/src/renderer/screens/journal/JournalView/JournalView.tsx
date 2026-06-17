import { Skeleton } from "@rox/ui/skeleton";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { JournalDay } from "./components/JournalDay";

export function JournalView() {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? "";

	const { data: entries = [], isReady } = useLiveQuery(
		(q) =>
			q
				.from({ journalEntries: collections.journalEntries })
				.where(({ journalEntries }) => eq(journalEntries.createdBy, userId)),
		[collections, userId],
	);

	// Newest day first. Sort client-side so we never depend on collection order.
	const sortedEntries = useMemo(
		() =>
			[...entries].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)),
		[entries],
	);

	// Cache-first: render existing rows immediately; show the skeleton only when
	// there is genuinely no data AND the collection isn't ready yet.
	if (sortedEntries.length === 0 && !isReady) {
		return <JournalSkeleton />;
	}

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto max-w-3xl px-6 py-8">
				<header className="mb-8">
					<h1 className="font-semibold text-2xl text-foreground">Журнал</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Ежедневная рефлексия по твоим сессиям, собранная Rox R1
					</p>
				</header>

				{sortedEntries.length === 0 ? (
					<JournalEmpty />
				) : (
					<div className="space-y-12">
						{sortedEntries.map((entry) => (
							<JournalDay key={entry.id} entry={entry} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function JournalSkeleton() {
	return (
		<div className="mx-auto max-w-3xl px-6 py-8">
			<Skeleton className="mb-8 h-8 w-40" />
			<div className="space-y-12">
				{[0, 1, 2].map((i) => (
					<div key={i} className="space-y-3">
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-20 w-full" />
						<Skeleton className="h-16 w-3/4" />
					</div>
				))}
			</div>
		</div>
	);
}

function JournalEmpty() {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-border border-dashed py-20 text-center">
			<span className="text-foreground text-sm">Журнал пока пуст</span>
			<span className="mt-1 max-w-sm text-muted-foreground text-xs">
				Записи появляются автоматически: каждый день Rox R1 разбирает твои
				сессии и собирает рефлексию, выводы и советы.
			</span>
		</div>
	);
}
