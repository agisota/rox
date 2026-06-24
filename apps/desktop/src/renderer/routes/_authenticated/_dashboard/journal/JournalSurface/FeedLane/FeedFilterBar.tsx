import { Input } from "@rox/ui/input";
import { cn } from "@rox/ui/utils";
import { useEffect, useState } from "react";
import { LuSearch, LuX } from "react-icons/lu";
import { KIND_FILTERS, STATUS_FILTERS } from "../status";
import type { FeedKindFilter, FeedStatusFilter } from "../types";

interface FeedFilterBarProps {
	kind: FeedKindFilter;
	status: FeedStatusFilter;
	/** Committed (debounced) query — drives the actual filtering upstream. */
	query: string;
	onKindChange: (kind: FeedKindFilter) => void;
	onStatusChange: (status: FeedStatusFilter) => void;
	onQueryChange: (query: string) => void;
}

/**
 * Sticky filter bar over the feed: kind chips + status chips + debounced text
 * search. Filtering is client-side (the whole feed is already in the Electric
 * collection), matching the Automations/Tasks debounce ergonomics (~280ms).
 */
export function FeedFilterBar({
	kind,
	status,
	query,
	onKindChange,
	onStatusChange,
	onQueryChange,
}: FeedFilterBarProps) {
	// Local input mirror so typing stays snappy; commit upstream on a debounce.
	const [draft, setDraft] = useState(query);

	// Keep the local draft in sync when the committed query changes externally
	// (e.g. URL navigation / reset button) without clobbering active typing.
	useEffect(() => {
		setDraft(query);
	}, [query]);

	useEffect(() => {
		if (draft === query) return;
		const id = setTimeout(() => onQueryChange(draft.trim()), 280);
		return () => clearTimeout(id);
	}, [draft, query, onQueryChange]);

	const hasFilters = kind !== "all" || status !== "all" || query !== "";

	return (
		<div className="flex flex-col gap-2.5 border-border/40 border-b bg-background/80 pb-3 backdrop-blur-sm">
			<div className="flex flex-wrap items-center gap-1.5">
				<ChipGroup>
					{KIND_FILTERS.map((f) => (
						<Chip
							key={f.value}
							active={kind === f.value}
							onClick={() => onKindChange(f.value)}
						>
							{f.label}
						</Chip>
					))}
				</ChipGroup>
				<span className="mx-1 h-4 w-px bg-border/60" aria-hidden />
				<ChipGroup>
					{STATUS_FILTERS.map((f) => (
						<Chip
							key={f.value}
							active={status === f.value}
							onClick={() => onStatusChange(f.value)}
						>
							{f.label}
						</Chip>
					))}
				</ChipGroup>
				{hasFilters && (
					<button
						type="button"
						onClick={() => {
							onKindChange("all");
							onStatusChange("all");
							onQueryChange("");
							setDraft("");
						}}
						className="ml-auto inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/40 px-2.5 py-1 font-medium text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
					>
						<LuX className="size-3" />
						Сбросить
					</button>
				)}
			</div>

			<div className="relative">
				<LuSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
				<Input
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					placeholder="Поиск по событиям…"
					className="h-8 border-border/60 bg-card/40 pl-8 text-sm backdrop-blur-sm"
				/>
				{draft && (
					<button
						type="button"
						onClick={() => {
							setDraft("");
							onQueryChange("");
						}}
						aria-label="Очистить поиск"
						className="-translate-y-1/2 absolute top-1/2 right-2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
					>
						<LuX className="size-3.5" />
					</button>
				)}
			</div>
		</div>
	);
}

function ChipGroup({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-wrap items-center gap-1">{children}</div>;
}

function Chip({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"rounded-full border px-2.5 py-1 font-medium text-[11px] transition-colors",
				active
					? "border-primary/40 bg-primary/15 text-foreground"
					: "border-border/50 bg-card/30 text-muted-foreground hover:border-border hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}
