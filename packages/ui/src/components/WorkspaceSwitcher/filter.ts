/**
 * Serializable core for the F26 workspace switcher.
 *
 * Lives in `@rox/ui` so desktop, web, and mobile (RN) all share one filter /
 * select contract over the Electric `organizations` collection. Pure functions
 * here take plain data (no React, no DOM) so they can be reused by the RN sheet
 * and unit-tested in isolation.
 */

export interface WorkspaceOption {
	/** Stable organization id (becomes the active organization on select). */
	id: string;
	/** Human name shown on the first line. */
	name: string;
	/** Path / slug shown on the second line. */
	path: string;
	/** Optional logo url for the avatar. */
	logo?: string | null;
}

/**
 * Normalize free text for case/diacritic-insensitive matching.
 */
function normalize(value: string): string {
	return value.trim().toLowerCase();
}

/**
 * Returns true when the option matches the query by name OR path.
 * An empty query matches everything.
 */
export function matchesWorkspace(
	option: WorkspaceOption,
	query: string,
): boolean {
	const q = normalize(query);
	if (q.length === 0) return true;
	return (
		normalize(option.name).includes(q) || normalize(option.path).includes(q)
	);
}

/**
 * Filter + stable-sort the option list for the switcher. The active workspace
 * is hoisted to the top; the remaining options keep their incoming order.
 */
export function filterWorkspaces(
	options: readonly WorkspaceOption[],
	query: string,
	activeId?: string | null,
): WorkspaceOption[] {
	const matched = options.filter((option) => matchesWorkspace(option, query));
	if (!activeId) return matched;
	return [...matched].sort((a, b) => {
		if (a.id === activeId) return -1;
		if (b.id === activeId) return 1;
		return 0;
	});
}
