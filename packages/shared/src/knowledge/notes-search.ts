/**
 * Client-safe helpers for the Notes full-text search snippet (D7 FTS).
 *
 * Lives in `@rox/shared` (no server deps) so the SAME sentinel constants are used
 * by the server (the `ts_headline` SQL in @rox/trpc .../notebooks/search-notes.ts)
 * and by the web + desktop UIs, which split the snippet on these sentinels and
 * render matched terms in a `<mark>` using ESCAPED React children — never
 * `dangerouslySetInnerHTML` (the snippet is raw note markdown). Using
 * `ts_headline`'s default `<b>` tags would force unsafe HTML, so we override the
 * Start/Stop selectors with these sentinels instead.
 */

/** ts_headline `StartSel` — wraps the start of a matched term in the snippet. */
export const NOTES_HEADLINE_START = "[[hl]]";
/** ts_headline `StopSel` — wraps the end of a matched term in the snippet. */
export const NOTES_HEADLINE_STOP = "[[/hl]]";

/** A run of snippet text; `highlight` marks a matched term. */
export interface SnippetSegment {
	text: string;
	highlight: boolean;
}

/**
 * Split a `ts_headline` snippet on the safe sentinels into highlighted /
 * non-highlighted runs so the UI can render matches without injecting HTML. Pure
 * + total: unmatched or malformed input yields a single non-highlighted segment,
 * and surrounding markdown is preserved verbatim (the UI escapes it as text).
 */
export function splitHighlightedSnippet(snippet: string): SnippetSegment[] {
	if (!snippet) return [];
	const segments: SnippetSegment[] = [];
	let rest = snippet;
	while (rest.length > 0) {
		const start = rest.indexOf(NOTES_HEADLINE_START);
		if (start === -1) {
			segments.push({ text: rest, highlight: false });
			break;
		}
		if (start > 0) {
			segments.push({ text: rest.slice(0, start), highlight: false });
		}
		const afterStart = rest.slice(start + NOTES_HEADLINE_START.length);
		const stop = afterStart.indexOf(NOTES_HEADLINE_STOP);
		if (stop === -1) {
			// Unbalanced marker — treat the remainder as plain text.
			segments.push({ text: afterStart, highlight: false });
			break;
		}
		const highlighted = afterStart.slice(0, stop);
		if (highlighted.length > 0) {
			segments.push({ text: highlighted, highlight: true });
		}
		rest = afterStart.slice(stop + NOTES_HEADLINE_STOP.length);
	}
	return segments;
}
