/**
 * Tag normalization for saved prompts.
 *
 * Tags now persist as a real `saved_prompts.tags` column, so the historical
 * hidden-`<!--rox:meta-->` body codec that used to live here was removed (a
 * server-side backfill migrates any surviving blocks). This module keeps only
 * the pure tag-normalization helper shared by the editor and the data layer.
 */

function normalizeTag(tag: string): string {
	return tag.trim().replace(/\s+/g, " ");
}

/** De-dupe (case-insensitive), trim, drop empties, preserve first-seen order. */
export function normalizeTags(tags: readonly string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of tags) {
		const tag = normalizeTag(raw);
		if (tag.length === 0) continue;
		const key = tag.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(tag);
	}
	return out;
}
