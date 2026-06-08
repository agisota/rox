/**
 * `[[wikilink]]` parsing for the knowledge layer (fumadocs epic).
 *
 * Supports Obsidian-style links: `[[slug]]`, `[[slug|Alias]]`, and embeds
 * `![[slug]]`. Returns normalized kebab-case target slugs so they line up with
 * `knowledge_documents.slug`.
 */

export interface WikiLink {
	/** Normalized kebab-case target slug. */
	target: string;
	/** Display alias if `[[slug|Alias]]` form was used. */
	alias?: string;
	/** True for embed form `![[slug]]`. */
	embed: boolean;
	/** Raw matched text including brackets. */
	raw: string;
}

const WIKILINK_RE = /(!?)\[\[([^\]]+?)\]\]/g;

/** Normalize a wikilink target into a kebab-case slug. */
export function normalizeWikiLinkTarget(target: string): string {
	return (
		target
			.trim()
			// drop a leading path and #heading/^block anchors
			.replace(/[#^].*$/, "")
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9/]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.replace(/\/+/g, "/")
	);
}

/** Extract all wikilinks from a markdown/MDX source. */
export function parseWikiLinks(source: string): WikiLink[] {
	const links: WikiLink[] = [];
	for (const m of source.matchAll(WIKILINK_RE)) {
		const inner = m[2];
		if (!inner) continue;
		const [rawTarget, alias] = inner.split("|");
		const target = normalizeWikiLinkTarget(rawTarget ?? "");
		if (!target) continue;
		links.push({
			target,
			alias: alias?.trim() || undefined,
			embed: m[1] === "!",
			raw: m[0],
		});
	}
	return links;
}

/** Distinct, normalized target slugs referenced by a source document. */
export function extractWikiLinkTargets(source: string): string[] {
	return Array.from(new Set(parseWikiLinks(source).map((l) => l.target)));
}

const TAG_RE = /(?:^|\s)#([a-z0-9][a-z0-9/_-]*)/gi;

/** Extract `#tags` (Obsidian style) as a distinct lowercase list. */
export function extractTags(source: string): string[] {
	const tags = new Set<string>();
	for (const m of source.matchAll(TAG_RE)) {
		const tag = m[1]?.toLowerCase();
		if (tag) tags.add(tag);
	}
	return Array.from(tags);
}
