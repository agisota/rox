/**
 * Shared slash-menu matcher (F45).
 *
 * Built on the same fuzzy scorer and `/` scope grammar as the F44 command
 * palette (`../matcher`), so there is exactly one prefix grammar and one ranking
 * implementation across the ⌘K palette and the composer slash menu. This module
 * adds slash-specific concerns the generic palette does not have: alias
 * matching, badge-category ordering, and detecting the active slash query from
 * raw composer text.
 */

import { fuzzyScore } from "../matcher";
import { type SlashMenuEntry, slashSourceRank } from "./slash-command-source";

/** A scored slash-menu entry. */
export interface SlashMenuMatch {
	entry: SlashMenuEntry;
	score: number;
}

/**
 * Detect the active slash query from raw composer text. Mirrors the desktop
 * Tiptap `allow`/`items` seam: the menu is active only when the whole input is a
 * single-line `/token` (no spaces, no newline). Returns the token after `/`
 * (possibly empty, when the user has only typed `/`), or `null` when no menu
 * should show.
 */
export function getSlashMenuQuery(rawInput: string): string | null {
	if (rawInput.includes("\n")) return null;
	const match = rawInput.match(/^\/(\S*)$/);
	if (!match) return null;
	return match[1] ?? "";
}

/**
 * Best fuzzy score for an entry against a query, considering its name and every
 * alias. Returns `-1` when nothing matches. Name matches are preferred over
 * alias matches at equal raw score.
 */
function scoreEntry(entry: SlashMenuEntry, query: string): number {
	if (!query) return 0;
	const nameScore = fuzzyScore(entry.name, query);
	let best = nameScore;
	for (const alias of entry.aliases) {
		const aliasScore = fuzzyScore(alias, query);
		// Lightly discount alias hits so a name match wins ties.
		const discounted = aliasScore < 0 ? aliasScore : aliasScore * 0.99;
		if (discounted > best) best = discounted;
	}
	return best;
}

/**
 * Filter + rank slash-menu entries against a query (the text after `/`). Entries
 * are grouped by badge category (built-ins after custom, matching the desktop
 * order) and then by fuzzy score, then name. An empty query lists everything in
 * that stable order.
 */
export function filterSlashMenu(
	entries: SlashMenuEntry[],
	query: string,
): SlashMenuMatch[] {
	const matches: SlashMenuMatch[] = [];
	for (const entry of entries) {
		const score = scoreEntry(entry, query);
		if (score >= 0) matches.push({ entry, score });
	}

	matches.sort((a, b) => {
		const rankDelta =
			slashSourceRank(a.entry.source) - slashSourceRank(b.entry.source);
		if (rankDelta !== 0) return rankDelta;
		if (b.score !== a.score) return b.score - a.score;
		return a.entry.name.localeCompare(b.entry.name);
	});

	return matches;
}
