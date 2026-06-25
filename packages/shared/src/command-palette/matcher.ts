import type { Command, ScopePrefix } from "./types";

const SCOPE_PREFIXES: ScopePrefix[] = [">", "#", "@", "/"];

export interface ParsedQuery {
	/** The active scope, or `null` when the query has no leading prefix. */
	scope: ScopePrefix | null;
	/** The query with any leading scope prefix stripped and trimmed. */
	term: string;
}

/**
 * Parse a raw palette input into a scope + search term. Aligns with the F45
 * slash grammar: `>` commands · `#` tags · `@` profiles · `/` files.
 */
export function parseQuery(raw: string): ParsedQuery {
	const value = raw.trimStart();
	const head = value[0] as ScopePrefix | undefined;
	if (head && SCOPE_PREFIXES.includes(head)) {
		return { scope: head, term: value.slice(1).trim() };
	}
	return { scope: null, term: value.trim() };
}

/**
 * Subsequence fuzzy score: every char of `query` must appear in order within
 * `text`. Returns a score in `[0, 1]` (higher is better) or `-1` for no match.
 * Contiguous runs and early matches are rewarded so prefix hits rank first.
 */
export function fuzzyScore(text: string, query: string): number {
	if (!query) return 0;
	const haystack = text.toLowerCase();
	const needle = query.toLowerCase();

	let hayIdx = 0;
	let score = 0;
	let streak = 0;
	for (const char of needle) {
		const found = haystack.indexOf(char, hayIdx);
		if (found === -1) return -1;
		streak = found === hayIdx ? streak + 1 : 0;
		// Reward contiguous runs and matches near the start of the string.
		score += 1 + streak * 0.5 + (found === 0 ? 0.5 : 0);
		hayIdx = found + 1;
	}
	// Normalize by needle length and lightly penalize long haystacks.
	return score / (needle.length * 2 + haystack.length * 0.01);
}

/** The searchable text for a command: title + keywords. */
function commandHaystack<Ctx>(command: Command<Ctx>): string {
	return command.keywords?.length
		? `${command.title} ${command.keywords.join(" ")}`
		: command.title;
}

export interface MatchResult<Ctx> {
	command: Command<Ctx>;
	score: number;
}

/**
 * Filter + rank commands against a raw palette query. When the query carries a
 * scope prefix, only commands declaring that `scope` (or with no scope, for the
 * `>` command default) are considered.
 */
export function matchCommands<Ctx>(
	commands: Command<Ctx>[],
	raw: string,
): MatchResult<Ctx>[] {
	const { scope, term } = parseQuery(raw);

	const scoped = scope
		? commands.filter((command) =>
				scope === ">"
					? command.scope === undefined || command.scope === ">"
					: command.scope === scope,
			)
		: commands;

	if (!term) {
		return scoped.map((command) => ({ command, score: 0 }));
	}

	const results: MatchResult<Ctx>[] = [];
	for (const command of scoped) {
		const score = fuzzyScore(commandHaystack(command), term);
		if (score >= 0) results.push({ command, score });
	}
	results.sort((a, b) => b.score - a.score);
	return results;
}
