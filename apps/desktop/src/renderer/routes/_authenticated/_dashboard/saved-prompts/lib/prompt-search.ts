import Fuse, { type IFuseOptions } from "fuse.js";
import type { PromptEntry } from "./types";

/**
 * Fuzzy search over the prompt library (pure, web-twin-safe). Mirrors the
 * Skills-library `createSkillSearch` pattern: build the index once per data
 * change via `useMemo`, then call `search`. Ranks across title + body + tags
 * with title weighted highest.
 */
const FUSE_OPTIONS: IFuseOptions<PromptEntry> = {
	includeScore: true,
	ignoreLocation: true,
	threshold: 0.4,
	minMatchCharLength: 2,
	keys: [
		{ name: "title", weight: 0.6 },
		{ name: "body", weight: 0.3 },
		{ name: "tags", weight: 0.1 },
	],
};

export function createPromptSearch(items: readonly PromptEntry[]) {
	const fuse = new Fuse(items as PromptEntry[], FUSE_OPTIONS);
	return {
		search(query: string): PromptEntry[] {
			const trimmed = query.trim();
			if (trimmed.length === 0) return items as PromptEntry[];
			return fuse.search(trimmed).map((result) => result.item);
		},
	};
}
