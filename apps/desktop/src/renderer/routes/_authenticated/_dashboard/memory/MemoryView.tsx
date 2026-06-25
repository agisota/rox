import type { SelectMemoryItem } from "@rox/db/schema";
import { Button } from "@rox/ui/button";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineCommandLine } from "react-icons/hi2";
import { LuBrain } from "react-icons/lu";
import { DashboardSurface } from "renderer/components/DashboardSurface";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { ImportPanel } from "renderer/screens/memory/MemoryView/components/ImportPanel";
import { MemorySuggestions } from "renderer/screens/memory/MemoryView/components/MemorySuggestions";
import { MEMORY_GROUPS } from "renderer/screens/memory/MemoryView/groups";
import { AgentContextPreview } from "./components/AgentContextPreview";
import { MemoryCommandPalette } from "./components/MemoryCommandPalette";
import { MemoryGroupEditable } from "./components/MemoryGroupEditable";
import { MemorySkeleton } from "./components/MemorySkeleton";
import { type CategoryFilter, SearchHeader } from "./components/SearchHeader";
import { SearchResults } from "./components/SearchResults";
import { SimilarSheet } from "./components/SimilarSheet";
import { useMemorySearch } from "./hooks/useMemorySearch";
import { toSearchWords } from "./lib/highlight";
import type { SimilarityCluster } from "./lib/similarity";

const SEARCH_DEBOUNCE_MS = 200;

/**
 * Memory — the per-user "second memory" the agent reads on every chat turn,
 * upgraded from a write/curate surface into a true store + retrieval UI.
 *
 * Non-empty query  -> one flat BM25-ranked list (Orama, typo-tolerant) with
 *                     matched-term highlighting, composable with category chips.
 * Empty query      -> the five category groups (each row now editable in place).
 *
 * Search is entirely client-side over the resident memoryItems Electric
 * collection: zero network, offline-capable. Import / suggestions / manual-add /
 * seed examples are preserved.
 */
export function MemoryView() {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? "";

	const { data: items = [], isReady } = useLiveQuery(
		(q) =>
			q
				.from({ memoryItems: collections.memoryItems })
				.where(({ memoryItems }) => eq(memoryItems.createdBy, userId)),
		[collections, userId],
	);

	// Approved items are the searchable + groupable store; suggestions/dismissed
	// are handled separately (banner / hidden) exactly as before.
	const approved = useMemo(
		() => items.filter((item) => item.status === "approved"),
		[items],
	);

	const suggested = useMemo(
		() =>
			items
				.filter((item) => item.status === "suggested")
				.sort((a, b) =>
					a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
				),
		[items],
	);

	const byId = useMemo(() => {
		const map = new Map<string, SelectMemoryItem>();
		for (const item of approved) map.set(item.id, item);
		return map;
	}, [approved]);

	const approvedByCategory = useMemo(() => {
		const map = new Map<string, SelectMemoryItem[]>();
		for (const item of approved) {
			const arr = map.get(item.category) ?? [];
			arr.push(item);
			map.set(item.category, arr);
		}
		return map;
	}, [approved]);

	// Renderer-side Orama index, rebuilt on the approved set.
	const { runSearch, version: indexVersion } = useMemorySearch(approved);

	// --- Search + filter state ----------------------------------------------
	const [rawQuery, setRawQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [filter, setFilter] = useState<CategoryFilter>("all");
	const [rankedIds, setRankedIds] = useState<string[]>([]);
	const [flashId, setFlashId] = useState<string | null>(null);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [similarCluster, setSimilarCluster] =
		useState<SimilarityCluster | null>(null);
	const [similarOpen, setSimilarOpen] = useState(false);

	const showSimilar = useCallback((cluster: SimilarityCluster) => {
		setSimilarCluster(cluster);
		setSimilarOpen(true);
	}, []);

	const importPanelRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Debounce the inline query (200ms).
	useEffect(() => {
		const t = setTimeout(() => setDebouncedQuery(rawQuery), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [rawQuery]);

	// Run the ranked search whenever the debounced query or the store changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `indexVersion` is a deliberate trigger — it re-ranks once the Orama index reflects a store change (insert/edit/delete), even though it is not read in the body.
	useEffect(() => {
		let cancelled = false;
		const trimmed = debouncedQuery.trim();
		if (!trimmed) {
			setRankedIds([]);
			return;
		}
		void runSearch(trimmed).then((result) => {
			if (!cancelled) setRankedIds(result.rankedIds);
		});
		return () => {
			cancelled = true;
		};
	}, [debouncedQuery, runSearch, indexVersion]);

	const isSearching = debouncedQuery.trim() !== "";

	// Ranked + category-filtered results for the active query.
	const searchResults = useMemo(() => {
		const ranked: SelectMemoryItem[] = [];
		for (const id of rankedIds) {
			const item = byId.get(id);
			if (!item) continue;
			if (filter !== "all" && item.category !== filter) continue;
			ranked.push(item);
		}
		return ranked;
	}, [rankedIds, byId, filter]);

	const searchWords = useMemo(
		() => toSearchWords(debouncedQuery),
		[debouncedQuery],
	);

	// Live counts for the filter chips (respect the query when searching).
	const counts = useMemo(() => {
		const base: Record<CategoryFilter, number> = {
			all: 0,
			projects: 0,
			identity: 0,
			instructions: 0,
			career: 0,
			general: 0,
		};
		const source: SelectMemoryItem[] = isSearching
			? rankedIds
					.map((id) => byId.get(id))
					.filter((item): item is SelectMemoryItem => item !== undefined)
			: approved;
		for (const item of source) {
			base.all += 1;
			base[item.category] += 1;
		}
		return base;
	}, [isSearching, rankedIds, byId, approved]);

	// Palette search: same ranking, resolved straight to items.
	const paletteSearch = useCallback(
		async (query: string) => {
			const result = await runSearch(query);
			return result.rankedIds
				.map((id) => byId.get(id))
				.filter((item): item is SelectMemoryItem => item !== undefined);
		},
		[runSearch, byId],
	);

	// Scroll a row into view and pulse it (palette jump).
	const jumpTo = useCallback((id: string) => {
		setFlashId(id);
		// Defer until the row is mounted (a search may need to clear first).
		requestAnimationFrame(() => {
			const el = document.getElementById(`memory-row-${id}`);
			el?.scrollIntoView({ behavior: "smooth", block: "center" });
		});
		setTimeout(() => setFlashId(null), 1200);
	}, []);

	// ⌘K / Ctrl+K opens the palette.
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setPaletteOpen((open) => !open);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const focusAdd = useCallback(() => {
		searchInputRef.current?.focus();
	}, []);

	const openImport = useCallback(() => {
		importPanelRef.current?.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
	}, []);

	return (
		<DashboardSurface
			title="Память"
			description="Что Rox помнит о тебе и твоих проектах. Ищи, правь и добавляй — агент учитывает это в работе."
			icon={LuBrain}
			actions={
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => setPaletteOpen(true)}
					className="gap-1.5 text-muted-foreground text-xs"
				>
					<HiOutlineCommandLine className="size-3.5" />
					Поиск
					<kbd className="rounded bg-muted px-1 py-px font-mono text-[10px]">
						⌘K
					</kbd>
				</Button>
			}
		>
			<SearchHeader
				query={rawQuery}
				onQueryChange={setRawQuery}
				filter={filter}
				onFilterChange={setFilter}
				counts={counts}
				resultCount={isSearching ? searchResults.length : null}
				inputRef={searchInputRef}
			/>

			<div ref={importPanelRef}>
				<ImportPanel />
			</div>

			<MemorySuggestions items={suggested} />

			{isReady && !isSearching && approved.length > 0 && (
				<AgentContextPreview approved={approved} />
			)}

			{!isReady ? (
				<MemorySkeleton />
			) : isSearching ? (
				<SearchResults
					items={searchResults}
					searchWords={searchWords}
					flashId={flashId}
					approved={approved}
					onShowSimilar={showSimilar}
				/>
			) : (
				<div className="space-y-5">
					{MEMORY_GROUPS.filter(
						(group) => filter === "all" || group.category === filter,
					).map((group) => (
						<MemoryGroupEditable
							key={group.category}
							category={group.category}
							label={group.label}
							hint={group.hint}
							items={approvedByCategory.get(group.category) ?? []}
							isReady={isReady}
							flashId={flashId}
							onShowSimilar={showSimilar}
						/>
					))}
				</div>
			)}

			<MemoryCommandPalette
				open={paletteOpen}
				onOpenChange={setPaletteOpen}
				onSearch={paletteSearch}
				onJump={jumpTo}
				onAddNew={focusAdd}
				onOpenImport={openImport}
			/>

			<SimilarSheet
				cluster={similarCluster}
				open={similarOpen}
				onOpenChange={setSimilarOpen}
			/>
		</DashboardSurface>
	);
}
