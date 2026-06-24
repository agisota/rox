/**
 * Split a raw search query into individual highlight terms for
 * <Highlighter searchWords={...}> (react-highlight-words).
 *
 * Orama matched on tokenized words, so we mirror that: highlight each
 * whitespace-separated term (>=2 chars to avoid noise), deduped.
 */
export function toSearchWords(query: string): string[] {
	const seen = new Set<string>();
	const words: string[] = [];
	for (const raw of query.trim().split(/\s+/)) {
		const term = raw.trim();
		if (term.length < 2) continue;
		const key = term.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		words.push(term);
	}
	return words;
}
