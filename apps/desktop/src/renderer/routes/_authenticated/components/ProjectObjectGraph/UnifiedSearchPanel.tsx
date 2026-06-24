import {
	mapUnifiedSearchResults,
	UNIFIED_SEARCH_DEFAULT_KINDS,
	type UnifiedSearchResultViewModel,
} from "@rox/shared/unified-search-results";
import { Badge } from "@rox/ui/badge";
import { Input } from "@rox/ui/input";
import { Skeleton } from "@rox/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LuSearch } from "react-icons/lu";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";

/** Min query length before a search fires (matches `graphSearchSchema.query.min(1)`). */
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

export interface UnifiedSearchPanelProps {
	/**
	 * Open an object hit in place (selects it in the Project-OS shell so its
	 * details/edges render). Desktop is already in-app, so unlike the web surface
	 * we navigate by entity id rather than following the `rox://` deep link.
	 */
	onOpenHit?: (entityId: string) => void;
	/** Optional fallback rendered when the gate is closed (OFF = absent). */
	fallback?: React.ReactNode;
}

/**
 * Desktop parity for `projectOs.unifiedSearch` — a gated unified entity-search
 * panel over the native Rox object graph. A debounced query runs the shipped
 * `graph.search` (semantic with keyword auto-degrade) across the addressable
 * object kinds and renders the hits (title, kind badge, snippet); clicking a
 * navigable hit opens the object in the Project-OS shell.
 *
 * Ports `apps/web/.../(agents)/agents/search/UnifiedSearchPanel.tsx` and reuses
 * the same pure mapper (`@rox/shared/unified-search-results`) + the same shipped
 * `graph.search` tRPC query the desktop ProjectObjectGraph shell already calls.
 * No new query, no migration, no flag flip — this is the gated desktop surface.
 *
 * Mounted only when {@link ExperimentalFeatureGate} opens for
 * `projectOs.unifiedSearch`; OFF means the surface is absent (no regression).
 */
export function UnifiedSearchPanel({
	onOpenHit,
	fallback = null,
}: UnifiedSearchPanelProps) {
	return (
		<ExperimentalFeatureGate
			featureId="projectOs.unifiedSearch"
			fallback={fallback}
		>
			<UnifiedSearchSurface onOpenHit={onOpenHit} />
		</ExperimentalFeatureGate>
	);
}

/** The live surface, mounted only once the gate resolves `available`. */
function UnifiedSearchSurface({
	onOpenHit,
}: {
	onOpenHit?: (entityId: string) => void;
}) {
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
		<section className="space-y-4" aria-label="Единый поиск">
			<div>
				<h2 className="font-semibold text-lg">Единый поиск</h2>
				<p className="text-muted-foreground text-sm">
					Ищите по объектам проекта — заметкам, задачам, проектам, контактам,
					лентам и файлам.
				</p>
			</div>

			<div className="relative">
				<LuSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
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
				onOpenHit={onOpenHit}
				onRetry={() => void searchQuery.refetch()}
			/>
		</section>
	);
}

function UnifiedSearchResults({
	enabled,
	isSearching,
	isError,
	degraded,
	results,
	onOpenHit,
	onRetry,
}: {
	enabled: boolean;
	isSearching: boolean;
	isError: boolean;
	degraded: boolean;
	results: UnifiedSearchResultViewModel[];
	onOpenHit?: (entityId: string) => void;
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
						<UnifiedSearchRow result={result} onOpenHit={onOpenHit} />
					</li>
				))}
			</ul>
		</div>
	);
}

function UnifiedSearchRow({
	result,
	onOpenHit,
}: {
	result: UnifiedSearchResultViewModel;
	onOpenHit?: (entityId: string) => void;
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

	// A hit is navigable when its kind has an openable route (mirrors the web
	// surface's `href` gate) and the shell provided an open handler. Desktop opens
	// the object in place by entity id rather than following the `rox://` link.
	const navigable = Boolean(result.href) && Boolean(onOpenHit);

	if (!navigable) {
		// Non-navigable hit (no openable route, or no handler): shown, but inert.
		return <div className="block p-4">{body}</div>;
	}

	return (
		<button
			type="button"
			onClick={() => onOpenHit?.(result.id)}
			className="block w-full p-4 text-left transition-colors hover:bg-accent"
		>
			{body}
		</button>
	);
}
