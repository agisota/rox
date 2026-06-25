"use client";

import { splitHighlightedSnippet } from "@rox/shared/knowledge";
import {
	type MessageSearchResult,
	normalizeMessageSearchQuery,
	type TitleFilterable,
} from "@rox/shared/search";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

/** A title-matched item the instant lane renders (e.g. a loaded message line). */
export interface MessageTitleMatch extends TitleFilterable {
	/** Optional secondary line shown under the title (author, timestamp …). */
	subtitle?: string;
}

export interface MessageSearchBoxProps {
	/** The controlled query string. */
	query: string;
	/** Emitted on every keystroke; the platform owns debouncing the backend call. */
	onQueryChange: (query: string) => void;
	/**
	 * INSTANT lane — items whose display title matches the current query, already
	 * filtered by the platform via `filterByTitleTerm`. Rendered the keystroke
	 * after the user types, with no wait on the network.
	 */
	titleMatches: readonly MessageTitleMatch[];
	/**
	 * ASYNC lane — backend full-text content hits from `chat.searchMessages`, with
	 * `[[hl]]…[[/hl]]`-highlighted snippets. Layered UNDER the instant matches once
	 * they resolve; the two lanes never block each other.
	 */
	contentResults: readonly MessageSearchResult[];
	/** True while the backend content search is in flight (shows a hint). */
	isSearching?: boolean;
	/** Open an instant title match. */
	onSelectTitleMatch?: (item: MessageTitleMatch) => void;
	/** Open a backend content result. */
	onSelectContentResult?: (result: MessageSearchResult) => void;
	/** Placeholder for the search input. */
	placeholder?: string;
	/** Shown when a non-empty query yields nothing in either lane. */
	emptyLabel?: string;
	className?: string;
}

/**
 * In-conversation message search box (Hermes-borrow F15).
 *
 * A single presentational core for web / desktop / mobile: a live filter input
 * over two lanes — an INSTANT client-side title-match (rendered immediately) and
 * the ASYNC backend full-text CONTENT search (`chat.searchMessages`), layered on
 * top once it resolves. Matched terms render in a `<mark>` via the SAME
 * `[[hl]]…[[/hl]]` sentinels + `splitHighlightedSnippet` the notes / faceted
 * search use — escaped React children, never `dangerouslySetInnerHTML`. The
 * `<mark>` uses `box-decoration-break: clone` so a highlight that wraps across
 * lines keeps its rounded background on every line fragment.
 *
 * All data flows in via props and every action flows out via callbacks, so the
 * platform owns the tRPC wiring, debouncing, and navigation.
 */
export function MessageSearchBox({
	query,
	onQueryChange,
	titleMatches,
	contentResults,
	isSearching = false,
	onSelectTitleMatch,
	onSelectContentResult,
	placeholder = "Поиск по сообщениям…",
	emptyLabel = "Ничего не найдено",
	className,
}: MessageSearchBoxProps) {
	const term = normalizeMessageSearchQuery(query);
	const hasQuery = term !== null;
	const hasTitleMatches = titleMatches.length > 0;
	const hasContentResults = contentResults.length > 0;
	const showEmpty =
		hasQuery && !isSearching && !hasTitleMatches && !hasContentResults;

	return (
		<div
			data-slot="message-search-box"
			className={cn("flex w-full min-w-0 flex-col gap-2", className)}
		>
			<div className="relative">
				<input
					type="search"
					aria-label="Поиск по сообщениям"
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder={placeholder}
					className={cn(
						"w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm",
						"placeholder:text-muted-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
					)}
				/>
			</div>

			{hasQuery && (
				<div className="flex flex-col gap-2">
					{hasTitleMatches && (
						<Section label="Совпадения в списке">
							<ul className="flex flex-col gap-0.5">
								{titleMatches.map((item) => (
									<TitleMatchRow
										key={item.id}
										item={item}
										term={term}
										onSelect={onSelectTitleMatch}
									/>
								))}
							</ul>
						</Section>
					)}

					<Section
						label="Совпадения в тексте"
						hint={isSearching ? "Поиск…" : undefined}
					>
						{hasContentResults ? (
							<ul className="flex flex-col gap-0.5">
								{contentResults.map((result) => (
									<ContentResultRow
										key={result.id}
										result={result}
										onSelect={onSelectContentResult}
									/>
								))}
							</ul>
						) : (
							!isSearching && (
								<p className="px-1 py-2 text-xs text-muted-foreground">
									Нет совпадений в тексте сообщений
								</p>
							)
						)}
					</Section>

					{showEmpty && (
						<p className="px-1 py-6 text-center text-sm text-muted-foreground">
							{emptyLabel}
						</p>
					)}
				</div>
			)}
		</div>
	);
}

/** A labelled lane with an optional inline hint (e.g. the searching spinner). */
function Section({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between px-1">
				<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
					{label}
				</span>
				{hint && (
					<span className="text-[10px] text-muted-foreground">{hint}</span>
				)}
			</div>
			{children}
		</div>
	);
}

/**
 * The `<mark>` highlight class — `box-decoration-break: clone` (via the Tailwind
 * `box-decoration-clone` utility) so a highlight that wraps onto a second line
 * keeps its rounded yellow background on each line fragment.
 */
const MARK_CLASS =
	"box-decoration-clone rounded-sm bg-yellow-500/30 text-foreground";

/** Render a `ts_headline` snippet as escaped text with `<mark>`-ed matches. */
function HighlightedSnippet({ snippet }: { snippet: string }): ReactNode {
	return splitHighlightedSnippet(snippet).map((segment, index) =>
		segment.highlight ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: segments are positional + stable for one snippet
			<mark key={index} className={MARK_CLASS}>
				{segment.text}
			</mark>
		) : (
			// biome-ignore lint/suspicious/noArrayIndexKey: segments are positional + stable for one snippet
			<span key={index}>{segment.text}</span>
		),
	);
}

/**
 * Highlight every case-insensitive occurrence of `term` inside `text` with a
 * `<mark>`, using escaped React children (the instant lane has no server
 * `ts_headline`, so it highlights the raw substring itself).
 */
function highlightTerm(text: string, term: string): ReactNode {
	const needle = term.toLocaleLowerCase();
	const haystack = text.toLocaleLowerCase();
	const parts: ReactNode[] = [];
	let cursor = 0;
	let from = haystack.indexOf(needle);
	let key = 0;
	while (from !== -1) {
		if (from > cursor) {
			parts.push(<span key={key++}>{text.slice(cursor, from)}</span>);
		}
		parts.push(
			<mark key={key++} className={MARK_CLASS}>
				{text.slice(from, from + term.length)}
			</mark>,
		);
		cursor = from + term.length;
		from = haystack.indexOf(needle, cursor);
	}
	if (cursor < text.length) {
		parts.push(<span key={key++}>{text.slice(cursor)}</span>);
	}
	return parts;
}

/** One instant title-match row, with its matched term highlighted. */
function TitleMatchRow({
	item,
	term,
	onSelect,
}: {
	item: MessageTitleMatch;
	term: string;
	onSelect?: (item: MessageTitleMatch) => void;
}) {
	const interactive = Boolean(onSelect);
	return (
		<li>
			<button
				type="button"
				disabled={!interactive}
				onClick={() => onSelect?.(item)}
				className={cn(
					"flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left",
					interactive && "hover:bg-muted focus-visible:bg-muted",
					"focus-visible:outline-none",
				)}
			>
				<span className="truncate text-sm font-medium text-foreground">
					{highlightTerm(item.title, term)}
				</span>
				{item.subtitle && (
					<span className="truncate text-xs text-muted-foreground">
						{item.subtitle}
					</span>
				)}
			</button>
		</li>
	);
}

/** One backend content-search row, with its `ts_headline` snippet highlighted. */
function ContentResultRow({
	result,
	onSelect,
}: {
	result: MessageSearchResult;
	onSelect?: (result: MessageSearchResult) => void;
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
				<span className="truncate text-sm font-medium text-foreground">
					{result.title}
				</span>
				{result.snippet && (
					<span className="line-clamp-2 text-xs text-muted-foreground">
						<HighlightedSnippet snippet={result.snippet} />
					</span>
				)}
			</button>
		</li>
	);
}
