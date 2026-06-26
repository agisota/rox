import type { SelectMemoryItem } from "@rox/db/schema";
import { MotionList, MotionListItem } from "@rox/ui/motion";
import { HiOutlineMagnifyingGlass } from "react-icons/hi2";
import type { SimilarityCluster } from "../../lib/similarity";
import { MemoryRow } from "../MemoryRow";

interface SearchResultsProps {
	/** Already ranked + category-filtered approved items. */
	items: SelectMemoryItem[];
	/** Highlight terms for matched-text emphasis. */
	searchWords: string[];
	/** Id to pulse once after a command-palette jump (cleared by parent). */
	flashId?: string | null;
	/** Full approved set to scan for near-duplicates (cross-category in search). */
	approved?: readonly SelectMemoryItem[];
	/** Open the merge sheet for a detected near-duplicate cluster. */
	onShowSimilar?: (cluster: SimilarityCluster) => void;
}

/**
 * Flat, BM25-ranked result list shown while a search query is active. Replaces
 * the five grouped sections; restoring the empty query restores the groups.
 * Matched terms are highlighted; each row keeps the full edit/move/delete
 * affordances of MemoryRow.
 */
export function SearchResults({
	items,
	searchWords,
	flashId,
	approved,
	onShowSimilar,
}: SearchResultsProps) {
	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center rounded-lg border border-border border-dashed px-6 py-12 text-center">
				<HiOutlineMagnifyingGlass className="mb-2 size-6 text-muted-foreground/60" />
				<p className="text-foreground text-sm">Ничего не найдено</p>
				<p className="mt-1 text-muted-foreground text-xs">
					Попробуйте другой запрос или снимите фильтр категории.
				</p>
			</div>
		);
	}

	return (
		<MotionList className="space-y-1.5">
			{items.map((item) => (
				<MotionListItem key={item.id}>
					<MemoryRow
						item={item}
						searchWords={searchWords}
						showCategory
						flash={flashId === item.id}
						similarCandidates={approved}
						onShowSimilar={onShowSimilar}
					/>
				</MotionListItem>
			))}
		</MotionList>
	);
}
