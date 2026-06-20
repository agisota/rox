import type { SettingsItem } from "./settings-search";

/**
 * Pure, index-agnostic matcher for settings items.
 *
 * Given a free-text `query` and a list of `items`, returns the subset of items
 * that match. Matching is case-insensitive and substring-based across each
 * item's title, description, and keywords. An empty (or whitespace-only) query
 * matches everything, preserving the original input order.
 *
 * This function performs no I/O and does not reference the settings index, so
 * it can be unit-tested in isolation against either the real exported index or
 * small fixtures.
 */
export function matchSettings<T extends SettingsItem>(
	query: string,
	items: readonly T[],
): T[] {
	if (!query.trim()) return [...items];

	const q = query.toLowerCase();
	return items.filter(
		(item) =>
			item.title.toLowerCase().includes(q) ||
			item.description.toLowerCase().includes(q) ||
			item.keywords.some((kw) => kw.toLowerCase().includes(q)),
	);
}
