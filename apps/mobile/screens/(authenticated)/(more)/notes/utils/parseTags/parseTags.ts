/**
 * Tag parsing + normalization for the Notes editor and tag filter. The
 * notebooks router stores tags as a `string[]` (each trimmed, 1–40 chars). These
 * pure helpers keep the free-text "add tags" field and the filter chips in sync
 * with that contract and are unit-testable without a device.
 */

const MAX_TAG_LENGTH = 40;

/** Normalize a single raw tag: trim, collapse internal whitespace, clamp length. */
export function normalizeTag(raw: string): string {
	return raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
}

/**
 * Parse a free-text tag field into a deduped, normalized tag list. Splits on
 * commas (tags may contain spaces), drops blanks, and de-dupes
 * case-insensitively while preserving the first-seen casing + order.
 */
export function parseTags(input: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const part of input.split(",")) {
		const tag = normalizeTag(part);
		if (tag.length === 0) continue;
		const key = tag.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(tag);
	}
	return out;
}

/** Render a tag list back into the editable comma-separated field value. */
export function formatTags(tags: string[]): string {
	return tags.join(", ");
}

/** Toggle a tag in/out of a selection set (used by the filter chips). */
export function toggleTag(selected: string[], tag: string): string[] {
	const key = tag.toLowerCase();
	if (selected.some((t) => t.toLowerCase() === key)) {
		return selected.filter((t) => t.toLowerCase() !== key);
	}
	return [...selected, tag];
}

/**
 * Collect the distinct tags across a set of notes (case-insensitive dedupe,
 * sorted) to drive the available filter chips.
 */
export function collectTags(
	noteTags: (string[] | null | undefined)[],
): string[] {
	const seen = new Map<string, string>();
	for (const tags of noteTags) {
		for (const raw of tags ?? []) {
			const tag = normalizeTag(raw);
			if (tag.length === 0) continue;
			const key = tag.toLowerCase();
			if (!seen.has(key)) seen.set(key, tag);
		}
	}
	return [...seen.values()].sort((a, b) =>
		a.toLowerCase().localeCompare(b.toLowerCase()),
	);
}
