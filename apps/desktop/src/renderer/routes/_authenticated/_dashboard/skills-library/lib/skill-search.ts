/**
 * Fuzzy search for the Skills library (core, pure) — replaces the naive
 * substring filter with `fuse.js` (already an apps/desktop dependency).
 *
 * Generic over the searched item so both the installed-skills list and the
 * catalog grid reuse it. Returns the matched items in rank order; callers that
 * want highlighting can read the per-key match indices.
 *
 * React/electron-agnostic — usable on the web twin too.
 */

import Fuse, { type FuseResult, type IFuseOptions } from "fuse.js";

export interface SkillSearchKeys {
	name: string;
	slug?: string | null;
	description?: string | null;
	repo?: string | null;
	source?: string | null;
}

const FUSE_OPTIONS: IFuseOptions<unknown> = {
	includeMatches: true,
	includeScore: true,
	ignoreLocation: true,
	threshold: 0.4,
	minMatchCharLength: 2,
	keys: [
		{ name: "name", weight: 0.5 },
		{ name: "slug", weight: 0.2 },
		{ name: "description", weight: 0.2 },
		{ name: "repo", weight: 0.1 },
	],
};

/**
 * Filter + rank `items` by `query`. Empty/whitespace query returns the input
 * unchanged (stable order preserved). Exposed as a factory so callers can build
 * the Fuse index once per data change via `useMemo`.
 */
export function createSkillSearch<T extends SkillSearchKeys>(
	items: ReadonlyArray<T>,
) {
	const fuse = new Fuse(items as T[], FUSE_OPTIONS as IFuseOptions<T>);
	return {
		search(query: string): T[] {
			const trimmed = query.trim();
			if (trimmed.length === 0) return items as T[];
			return fuse.search(trimmed).map((result) => result.item);
		},
		/** Full Fuse results (with match indices) for highlight-aware callers. */
		searchWithMatches(query: string): FuseResult<T>[] {
			const trimmed = query.trim();
			if (trimmed.length === 0) {
				return (items as T[]).map((item, refIndex) => ({
					item,
					refIndex,
					matches: [],
				}));
			}
			return fuse.search(trimmed);
		},
	};
}

export type SkillSearch<T extends SkillSearchKeys> = ReturnType<
	typeof createSkillSearch<T>
>;
