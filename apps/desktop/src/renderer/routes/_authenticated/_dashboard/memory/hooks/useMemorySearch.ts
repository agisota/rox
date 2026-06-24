import { create, insertMultiple, type Orama, search } from "@orama/orama";
import type { SelectMemoryItem } from "@rox/db/schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Renderer-side full-text retrieval over the resident memory_items Electric
 * collection — zero network, works offline. This is the "retrieval UI" core the
 * Memory surface is named for.
 *
 * We use @orama/orama (Apache-2.0, in-browser, BM25 + typo tolerance) instead of
 * the deferred server-side pgvector path: the whole approved set already lives in
 * the renderer, so the index is built locally and kept in sync on every change.
 */

const MEMORY_SCHEMA = {
	body: "string",
	category: "string",
} as const;

interface MemoryDocument {
	id: string;
	body: string;
	category: string;
}

type MemoryIndex = Orama<typeof MEMORY_SCHEMA>;

export interface MemorySearchResult {
	/** Item ids in BM25-ranked order (best first). */
	rankedIds: string[];
	/** Fast membership test + rank lookup for the current query. */
	rankById: Map<string, number>;
}

const EMPTY_RESULT: MemorySearchResult = {
	rankedIds: [],
	rankById: new Map(),
};

/**
 * Build (and keep in sync) an Orama index over the given items, and return a
 * `runSearch(query)` that resolves a ranked id list for a raw query.
 *
 * The index rebuilds whenever the content `signature` changes (not on every
 * Electric array identity — Electric hands us a fresh array on each sync). The
 * items are read through a ref so `signature` is the single reactive trigger;
 * `runSearch` is keyed on the same signature, so its identity changes when the
 * store changes and consumers can simply list it in their effect deps to re-run.
 */
export function useMemorySearch(items: SelectMemoryItem[]) {
	// Cheap content key: ids + body length + category. Stable across unrelated
	// re-renders; changes whenever a memory is added/removed/recategorized or its
	// body length changes (the common edit case).
	const signature = useMemo(
		() =>
			items
				.map((item) => `${item.id}:${item.body.length}:${item.category}`)
				.join("|"),
		[items],
	);

	const indexRef = useRef<MemoryIndex | null>(null);
	const itemsRef = useRef(items);
	itemsRef.current = items;

	// Bumped after each rebuild. Consumers list it in their effect deps to re-run
	// a search once the index reflects the latest store.
	const [version, setVersion] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `signature` is the deliberate content key — the rebuild must fire on content change, while `items` is read via ref to avoid rebuilding on every Electric array identity.
	useEffect(() => {
		let cancelled = false;

		async function rebuild() {
			const index = create({ schema: MEMORY_SCHEMA });
			const docs: MemoryDocument[] = itemsRef.current.map((item) => ({
				id: item.id,
				body: item.body,
				category: item.category,
			}));
			if (docs.length > 0) {
				await insertMultiple(index, docs);
			}
			if (cancelled) return;
			indexRef.current = index;
			setVersion((v) => v + 1);
		}

		void rebuild();
		return () => {
			cancelled = true;
		};
	}, [signature]);

	/**
	 * Ranked search. Returns the empty result for blank queries (caller restores
	 * the grouped view) or before the index is ready. Stable across renders — it
	 * reads the latest index through `indexRef` — so pair it with `version` in
	 * effect deps to re-run after the store changes (insert/edit/delete).
	 */
	const runSearch = useCallback(
		async (query: string): Promise<MemorySearchResult> => {
			const trimmed = query.trim();
			const index = indexRef.current;
			if (!trimmed || !index) return EMPTY_RESULT;

			const result = await search(index, {
				term: trimmed,
				properties: ["body"],
				boost: { body: 2 },
				tolerance: 1,
				limit: 500,
			});

			const rankedIds: string[] = [];
			const rankById = new Map<string, number>();
			for (const hit of result.hits) {
				// Orama types `document.id` as `DocumentID` (string | number); our
				// item ids are strings, so normalize to the string-keyed contract.
				const id = String(hit.document.id);
				rankById.set(id, rankedIds.length);
				rankedIds.push(id);
			}
			return { rankedIds, rankById };
		},
		[],
	);

	return { runSearch, version };
}

export { EMPTY_RESULT };
