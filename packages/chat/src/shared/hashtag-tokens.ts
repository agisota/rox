/**
 * Pure `#hashtag` tokenizer for chat titles (Hermes-borrow F13). No DOM, no
 * React, no I/O — so the same title parses byte-identically on web, desktop, and
 * mobile, and the segment list is unit-testable without a renderer.
 *
 * A "hashtag" is a presentational, second tag axis: any `#word` written inside a
 * chat title becomes a clickable chip whose colour is hashed from the tag name
 * (shared with the F11/F24 auto-colour). It is deliberately *not* the org-label
 * axis (`chat_sessions.labels`): parsing a title never creates a label, so this
 * stays a zero-config overlay on top of free-text titles.
 */

/**
 * The body of a tag: letters/digits (any script, via `\p{L}`/`\p{N}`) with the
 * in-word separators `_` and `-` allowed only *between* alphanumerics, so a tag
 * neither starts nor ends on a separator (`#design-` tags `design`, leaving the
 * `-` as plain text; `#-` is not a tag at all). The first char must be
 * alphanumeric.
 */
const TAG_BODY = /[\p{L}\p{N}]+(?:[_-]+[\p{L}\p{N}]+)*/u;

/**
 * Matches a single `#tag` occurrence. The `#` must start a word (preceded by
 * start-of-string or whitespace) so mid-word `#` — `a#b`, URL fragments like
 * `page#section` — is left as plain text, matching how `#channel` mentions read.
 */
const HASHTAG = new RegExp(`(?<=^|\\s)#(${TAG_BODY.source})`, "gu");

/** A plain (non-tag) run of the title — rendered verbatim. */
export interface HashtagTextSegment {
	kind: "text";
	/** The literal text run. */
	text: string;
}

/** A `#tag` run of the title — rendered as a clickable chip. */
export interface HashtagTagSegment {
	kind: "tag";
	/** The full matched text including the leading `#` (`"#design"`). */
	text: string;
	/** The canonical tag name without `#` or trailing separators (`"design"`). */
	tag: string;
}

/** One ordered run of a parsed title: either plain text or a `#tag`. */
export type HashtagSegment = HashtagTextSegment | HashtagTagSegment;

/**
 * Split `title` into an ordered list of text / `#tag` segments. Concatenating
 * every segment's `text` reproduces `title` exactly (the parse is lossless), so
 * a renderer can interleave chips without dropping or reordering characters.
 *
 * A `#` with no alphanumeric body (`"#-"`, `"# "`) does not match, so it is kept
 * as plain text rather than emitted as an empty chip.
 */
export function parseHashtagSegments(title: string): HashtagSegment[] {
	if (!title) return [];

	const segments: HashtagSegment[] = [];
	let cursor = 0;

	for (const match of title.matchAll(HASHTAG)) {
		const start = match.index;
		const matchText = match[0];
		const tag = match[1] ?? "";

		if (start > cursor) {
			segments.push({ kind: "text", text: title.slice(cursor, start) });
		}
		segments.push({ kind: "tag", text: matchText, tag });
		cursor = start + matchText.length;
	}

	if (cursor < title.length) {
		segments.push({ kind: "text", text: title.slice(cursor) });
	}

	return segments;
}

/**
 * The distinct tag names in `title`, in first-seen order. Comparison is
 * case-insensitive (`#Design` and `#design` are one tag) and the original
 * casing of the first occurrence is preserved, so the deduped list reads the way
 * the author wrote it while still collapsing duplicates.
 */
export function extractHashtags(title: string): string[] {
	const seen = new Set<string>();
	const tags: string[] = [];

	for (const segment of parseHashtagSegments(title)) {
		if (segment.kind !== "tag") continue;
		const key = segment.tag.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		tags.push(segment.tag);
	}

	return tags;
}

/** Whether `title` contains at least one `#tag`. Cheap pre-check for renderers. */
export function hasHashtags(title: string): boolean {
	for (const segment of parseHashtagSegments(title)) {
		if (segment.kind === "tag") return true;
	}
	return false;
}
