import type { InboxItem } from "../types";
import { type DateGroup, dateGroupOf } from "./inboxTime";

/**
 * A flattened virtualizer row: either a sticky date-group header or a thread.
 * Flattening groups + items into one array lets a single `useVirtualizer`
 * window over headers and rows together (the standard TanStack Virtual pattern
 * for grouped lists) instead of nesting scroll containers.
 */
export type FlatRow =
	| { kind: "header"; group: DateGroup; id: string }
	| { kind: "item"; item: InboxItem; id: string };

const GROUP_ORDER: readonly DateGroup[] = ["today", "yesterday", "earlier"];

/**
 * Flatten a sorted item list into header+item rows, emitting a date-group
 * header only when the bucket changes. Assumes `items` are already newest-first
 * (as {@link mergeInboxItems} guarantees), so groups appear in
 * today → yesterday → earlier order without re-sorting.
 */
export function flattenGrouped(items: readonly InboxItem[]): FlatRow[] {
	const rows: FlatRow[] = [];
	let current: DateGroup | null = null;
	for (const item of items) {
		const group = dateGroupOf(item.timestamp);
		if (group !== current) {
			current = group;
			rows.push({ kind: "header", group, id: `header:${group}` });
		}
		rows.push({ kind: "item", item, id: item.key });
	}
	return rows;
}

/** Index of the next/previous selectable item row (skips headers), or -1. */
export function stepItemIndex(
	rows: readonly FlatRow[],
	fromKey: string | null,
	delta: 1 | -1,
): number {
	const itemIdx: number[] = [];
	for (let i = 0; i < rows.length; i++) {
		if (rows[i]?.kind === "item") itemIdx.push(i);
	}
	const first = itemIdx[0];
	if (first === undefined) return -1;
	const last = itemIdx[itemIdx.length - 1] ?? first;
	if (fromKey === null) return delta === 1 ? first : last;

	const pos = itemIdx.findIndex((i) => {
		const row = rows[i];
		return row?.kind === "item" && row.item.key === fromKey;
	});
	if (pos === -1) return first;

	const next = pos + delta;
	const clamped = itemIdx[next];
	return clamped === undefined ? (itemIdx[pos] ?? first) : clamped;
}

/** Stable group order (exported for tests / sticky-header positioning). */
export { GROUP_ORDER };
