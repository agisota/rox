"use client";

import { Badge } from "@rox/ui/badge";
import { Input } from "@rox/ui/input";
import { Skeleton } from "@rox/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useTRPC } from "@/trpc/react";
import {
	mapUnifiedSearchResults,
	UNIFIED_SEARCH_DEFAULT_KINDS,
	type UnifiedSearchResultViewModel,
} from "./unifiedSearchResults";
import { useDebouncedValue } from "./useDebouncedValue";

/** Min query length before a search fires (matches `graphSearchSchema.query.min(1)`). */
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

/**
 * Unified entity search over the native Rox object graph. A debounced query runs
 * the shipped `graph.search` (semantic with keyword auto-degrade) across the
 * addressable object kinds and renders the hits (title, kind badge, snippet),
 * deep-linking each navigable hit to its object via `rox://`. No new query and
 * no migration — `graph.search` already exists end-to-end; this is the gated web
 * surface for `projectOs.unifiedSearch`.
 *
 * Mounted only once {@link resolveUnifiedSearchGate} opens (active org + the
 * experimental feature resolves `available`), so the org scope on the router
 * (`requireActiveOrgMembership`) always has a caller.
 */
export function UnifiedSearchPanel() {
	const trpc = useTRPC();
	const [rawQuery, setRawQuery] = useState("");
	const query = useDebouncedValue(rawQuery.trim(), DEBOUNCE_MS);
	const enabled = query.length >= MIN_QUERY_LENGTH;

	const searchQuery = useQuery({
		...trpc.graph.search.queryOptions({
			query,
			kinds: [...UNIFIED_SEARCH_DEFAULT_KINDS],
			mode: "semantic",
			status: "active",
			limit: 25,
		}),
		enabled,
		// Keep the prior results visible while the next debounced query resolves so
		// the list does not flash empty on every keystroke.
		placeholderData: (previous) => previous,
	});

	const results: UnifiedSearchResultViewModel[] = useMemo(
		() => mapUnifiedSearchResults(searchQuery.data?.hits ?? []),
		[searchQuery.data],
	);

	const isSearching = enabled && searchQuery.isFetching;

	return (
		<div className="space-y-4">
			<div>
				<h2 className="font-semibold text-lg">Единый поиск</h2>
				<p className="text-muted-foreground text-sm">
					Ищите по объектам проекта — заметкам, задачам, проектам, контактам,
					лентам и файлам.
				</p>
			</div>

			<div className="relative">
				<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
				<Input
					type="search"
					value={rawQuery}
					onChange={(event) => setRawQuery(event.target.value)}
					placeholder="Поиск по объектам…"
					aria-label="Поиск по объектам"
					className="pl-9"
				/>
			</div>

			<UnifiedSearchResults
				enabled={enabled}
				isSearching={isSearching}
				isError={searchQuery.isError}
				degraded={searchQuery.data?.degraded ?? false}
				results={results}
				onRetry={() => void searchQuery.refetch()}
			/>
		</div>
	);
}

function UnifiedSearchResults({
	enabled,
	isSearching,
	isError,
	degraded,
	results,
	onRetry,
}: {
	enabled: boolean;
	isSearching: boolean;
	isError: boolean;
	degraded: boolean;
	results: UnifiedSearchResultViewModel[];
	onRetry: () => void;
}) {
	if (!enabled) {
		return (
			<p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Введите запрос, чтобы найти объекты проекта.
			</p>
		);
	}

	if (isError) {
		return (
			<div className="rounded-lg border border-destructive/40 p-4 text-sm">
				<p className="text-destructive">Не удалось выполнить поиск.</p>
				<button
					type="button"
					onClick={onRetry}
					className="mt-2 text-muted-foreground underline underline-offset-4 hover:text-foreground"
				>
					Повторить
				</button>
			</div>
		);
	}

	if (results.length === 0 && isSearching) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-14 w-full rounded-lg" />
				<Skeleton className="h-14 w-full rounded-lg" />
				<Skeleton className="h-14 w-full rounded-lg" />
			</div>
		);
	}

	if (results.length === 0) {
		return (
			<p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Ничего не найдено. Попробуйте изменить запрос.
			</p>
		);
	}

	return (
		<div className="space-y-2">
			{degraded ? (
				<p className="text-muted-foreground text-xs">
					Семантический поиск недоступен — показаны результаты поиска по
					ключевым словам.
				</p>
			) : null}
			<ul className="divide-y rounded-lg border">
				{results.map((result) => (
					<li key={result.id}>
						<UnifiedSearchRow result={result} />
					</li>
				))}
			</ul>
		</div>
	);
}

function UnifiedSearchRow({
	result,
}: {
	result: UnifiedSearchResultViewModel;
}) {
	const body = (
		<>
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<span className="truncate font-medium">{result.title}</span>
				<Badge variant="outline">{result.kindLabel}</Badge>
			</div>
			{result.snippet ? (
				<p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
					{result.snippet}
				</p>
			) : null}
		</>
	);

	if (!result.href) {
		// Non-navigable hit (no slug or no openable route): shown, but inert.
		return <div className="block p-4">{body}</div>;
	}

	return (
		<a
			href={result.href}
			className="block p-4 transition-colors hover:bg-accent"
		>
			{body}
		</a>
	);
}
