"use client";

import { splitHighlightedSnippet } from "@rox/shared/knowledge";
import {
	type SearchFacet,
	type SearchFacetCounts,
	type SearchResult,
	type SearchScopeType,
	searchFacetLabel,
	searchKindLabel,
	totalFacetCount,
} from "@rox/shared/search";

import { cn } from "../../lib/utils";

export interface FacetedSearchResultsProps {
	/** Ranked results across every facet (already merged + ordered by score). */
	results: readonly SearchResult[];
	/** Per-facet totals — independent of the page LIMIT (drives the chip counts). */
	facetCounts: SearchFacetCounts;
	/** The active segment chip, or null for the "All" view. */
	activeFacet: SearchFacet | null;
	/** Select a segment chip (null = All). */
	onSelectFacet: (facet: SearchFacet | null) => void;
	/** The current search scope discriminant (drives which chips are shown). */
	scope: SearchScopeType;
	/** Switch the scope (project ⇄ chat ⇄ global). The platform owns the ids. */
	onSelectScope?: (scope: SearchScopeType) => void;
	/** Open a result row. The platform owns the deep-link / navigation. */
	onSelectResult?: (result: SearchResult) => void;
	/** Shown when there are no results for the active facet. */
	emptyLabel?: string;
	className?: string;
}

/** The facet segments shown for a scope. `chat` only searches messages. */
function visibleFacets(scope: SearchScopeType): readonly SearchFacet[] {
	if (scope === "chat") return ["messages"];
	return ["titles", "messages", "toolCalls", "files"];
}

const SCOPE_LABELS: Record<SearchScopeType, string> = {
	global: "Везде",
	project: "В проекте",
	chat: "В чате",
};

const CHIP_BASE =
	"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Presentational faceted search panel (Hermes-borrow F16).
 *
 * Renders a scope switcher (Везде / В проекте / В чате), a segment chip row with
 * per-facet counts (Заголовки / Сообщения / Вызовы инструментов / Файлы) plus an
 * "Всё" chip, and the ranked result list with safely-highlighted snippets. All
 * data flows in via props and every action flows out via callbacks, so the same
 * component drives web, desktop, and mobile from a single core — the platform
 * owns the tRPC wiring, scope ids, and navigation.
 */
export function FacetedSearchResults({
	results,
	facetCounts,
	activeFacet,
	onSelectFacet,
	scope,
	onSelectScope,
	onSelectResult,
	emptyLabel = "Ничего не найдено",
	className,
}: FacetedSearchResultsProps) {
	const facets = visibleFacets(scope);
	const visible =
		activeFacet === null
			? results
			: results.filter((result) => result.facet === activeFacet);

	return (
		<div
			data-slot="faceted-search-results"
			className={cn("flex w-full min-w-0 flex-col gap-2", className)}
		>
			{onSelectScope && (
				<div className="flex items-center gap-1.5">
					{(["global", "project", "chat"] as const).map((scopeType) => (
						<button
							key={scopeType}
							type="button"
							aria-pressed={scope === scopeType}
							onClick={() => onSelectScope(scopeType)}
							className={cn(
								CHIP_BASE,
								scope === scopeType
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
						>
							{SCOPE_LABELS[scopeType]}
						</button>
					))}
				</div>
			)}

			<div className="flex items-center gap-1.5 overflow-x-auto">
				<SegmentChip
					label="Всё"
					count={totalFacetCount(facetCounts)}
					active={activeFacet === null}
					onSelect={() => onSelectFacet(null)}
				/>
				{facets.map((facet) => (
					<SegmentChip
						key={facet}
						label={searchFacetLabel(facet)}
						count={facetCounts[facet]}
						active={activeFacet === facet}
						onSelect={() => onSelectFacet(facet)}
					/>
				))}
			</div>

			{visible.length === 0 ? (
				<p className="px-1 py-6 text-center text-sm text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				<ul className="flex flex-col gap-0.5">
					{visible.map((result) => (
						<ResultRow
							key={`${result.kind}:${result.id}`}
							result={result}
							onSelect={onSelectResult}
						/>
					))}
				</ul>
			)}
		</div>
	);
}

/** A segment chip: a facet label + its match count. */
function SegmentChip({
	label,
	count,
	active,
	onSelect,
}: {
	label: string;
	count: number;
	active: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onSelect}
			className={cn(
				CHIP_BASE,
				active
					? "bg-accent text-accent-foreground"
					: "text-muted-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			<span>{label}</span>
			<span className="tabular-nums opacity-70">{count}</span>
		</button>
	);
}

/** One result row: kind label, title, and a safely-highlighted snippet. */
function ResultRow({
	result,
	onSelect,
}: {
	result: SearchResult;
	onSelect?: (result: SearchResult) => void;
}) {
	const interactive = Boolean(onSelect);
	return (
		<li>
			<button
				type="button"
				disabled={!interactive}
				onClick={() => onSelect?.(result)}
				className={cn(
					"flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left",
					interactive && "hover:bg-muted focus-visible:bg-muted",
					"focus-visible:outline-none",
				)}
			>
				<span className="flex items-center gap-1.5">
					<span className="rounded bg-muted px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						{searchKindLabel(result.kind)}
					</span>
					<span className="truncate text-sm font-medium text-foreground">
						{result.title}
					</span>
				</span>
				{result.snippet && (
					<span className="line-clamp-2 text-xs text-muted-foreground">
						{splitHighlightedSnippet(result.snippet).map((segment, index) =>
							segment.highlight ? (
								// biome-ignore lint/suspicious/noArrayIndexKey: segments are positional + stable for one snippet
								<mark key={index} className="bg-yellow-500/30 text-foreground">
									{segment.text}
								</mark>
							) : (
								// biome-ignore lint/suspicious/noArrayIndexKey: segments are positional + stable for one snippet
								<span key={index}>{segment.text}</span>
							),
						)}
					</span>
				)}
			</button>
		</li>
	);
}
