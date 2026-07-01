/**
 * Pure Obsidian markdown note parser for the local-vault import path.
 *
 * Obsidian is a LOCAL vault (no cloud webhook): the host-service reads vault
 * files off disk and hands each `{ path, content }` to `importNotes`, which runs
 * every note through `parseObsidianNote` before upserting into
 * `knowledge_documents`. This module is intentionally pure (no DB, no fs, no
 * network) so it is trivially unit-testable without a live vault.
 *
 * It composes the dependency-free, already-tested helpers from
 * `@rox/shared/knowledge` (`parseFrontmatter`, `extractWikiLinkTargets`,
 * `extractTags`) and adds the Obsidian-specific glue: title resolution, a
 * path-derived kebab slug, and merged frontmatter + inline `#tags`. Reusing the
 * shared parsers keeps frontmatter/wikilink semantics identical to the rest of
 * the knowledge layer instead of forking a second hand-rolled implementation.
 *
 * `parseObsidianNote` NEVER throws: malformed frontmatter, empty content, or odd
 * paths degrade to sensible fallbacks so a single bad vault file can't abort a
 * whole import batch.
 */

import {
	extractTags,
	extractWikiLinkTargets,
	parseFrontmatter,
} from "@rox/shared/knowledge";

/** A raw vault note as read by the host-service. */
export interface ObsidianNoteInput {
	/** Vault-relative path, e.g. `Notes/Ideas/My Note.md`. */
	path: string;
	/** Full file contents (frontmatter + markdown body). */
	content: string;
}

/** Optional context for the parser (reserved; kept for signature stability). */
export interface ParseObsidianNoteContext {
	/** Organization the note will be imported into (currently unused). */
	organizationId?: string;
}

/** Normalized note ready to upsert into `knowledge_documents`. */
export interface ParsedObsidianNote {
	/** Kebab-case slug derived from the path (extension stripped). */
	slug: string;
	/** frontmatter.title → first `# H1` → filename (basename, no `.md`). */
	title: string;
	/** Markdown body with the frontmatter block removed. */
	markdown: string;
	/** Parsed frontmatter (empty object when absent/malformed). */
	frontmatter: Record<string, unknown>;
	/** Distinct tags merged from frontmatter `tags` and inline `#tags`. */
	tags: string[];
	/** Distinct kebab `[[wikilink]]` targets referenced by the note. */
	wikilinks: string[];
	/** Discriminator for the knowledge source kind (no enum/migration change). */
	sourceKind: "obsidian_import";
	/** Provenance: the originating vault file path. */
	sourceRef: { filePath: string };
}

/** Strip a leading directory path and a trailing `.md`/`.mdx`/`.markdown`. */
function basenameWithoutExtension(path: string): string {
	// Accept both POSIX and Windows separators from arbitrary vault paths.
	const segments = path.split(/[\\/]/);
	const last = segments[segments.length - 1] ?? "";
	return last.replace(/\.(mdx?|markdown)$/i, "");
}

/**
 * Kebab-case slug from the full vault path (extension stripped). Mirrors
 * `knowledgeSlugSchema` (a-z, 0-9, `-`, `/`): path separators are preserved as
 * `/` so nested notes keep a stable address; everything else collapses to `-`.
 */
function pathToSlug(path: string): string {
	const withoutExtension = path.replace(/\.(mdx?|markdown)$/i, "");
	return (
		withoutExtension
			// normalize separators to a single forward slash
			.replace(/[\\/]+/g, "/")
			.toLowerCase()
			// keep alphanumerics and the path separator; everything else → '-'
			.replace(/[^a-z0-9/]+/g, "-")
			// trim stray separators around each path segment
			.split("/")
			.map((segment) => segment.replace(/^-+|-+$/g, ""))
			.filter(Boolean)
			.join("/")
	);
}

/** First ATX `# H1` heading text, if the body opens with (or contains) one. */
function firstH1(markdown: string): string | undefined {
	for (const line of markdown.split(/\r?\n/)) {
		const match = /^#\s+(.+?)\s*#*\s*$/.exec(line.trim());
		if (match?.[1]) return match[1].trim();
	}
	return undefined;
}

/** Coerce a frontmatter `tags` value (string[] | string | other) to string[]. */
function tagsFromFrontmatter(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.filter((entry): entry is string => typeof entry === "string")
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	if (typeof value === "string") {
		// Allow a comma/space separated scalar, e.g. `tags: a, b c`.
		return value
			.split(/[,\s]+/)
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	return [];
}

/**
 * Parse a single Obsidian vault note into the shape `importNotes` upserts.
 *
 * Pure and total: any parsing hiccup degrades gracefully (empty frontmatter,
 * filename-derived title, empty tag/wikilink lists) rather than throwing.
 */
export function parseObsidianNote(
	note: ObsidianNoteInput,
	_ctx?: ParseObsidianNoteContext,
): ParsedObsidianNote {
	const path = typeof note?.path === "string" ? note.path : "";
	const rawContent = typeof note?.content === "string" ? note.content : "";

	// `parseFrontmatter` already tolerates a missing/partial block and returns
	// `{ frontmatter: {}, content: raw }` when there is no leading `--- … ---`.
	let frontmatter: Record<string, unknown> = {};
	let markdown = rawContent;
	try {
		const parsed = parseFrontmatter(rawContent);
		frontmatter = parsed.frontmatter ?? {};
		markdown = parsed.content ?? rawContent;
	} catch {
		// Defensive: never let a malformed note abort the batch.
		frontmatter = {};
		markdown = rawContent;
	}

	const filename = basenameWithoutExtension(path);
	const frontmatterTitle =
		typeof frontmatter.title === "string" && frontmatter.title.trim()
			? frontmatter.title.trim()
			: undefined;
	const title = frontmatterTitle ?? firstH1(markdown) ?? filename;

	// Slug from the path; fall back to a kebab of the title for pathless input.
	const slug = pathToSlug(path) || pathToSlug(title);

	// Merge frontmatter tags with inline `#tags` from the body, deduped.
	const tags = Array.from(
		new Set([
			...tagsFromFrontmatter(frontmatter.tags),
			...extractTags(markdown),
		]),
	);

	const wikilinks = extractWikiLinkTargets(markdown);

	return {
		slug,
		title,
		markdown,
		frontmatter,
		tags,
		wikilinks,
		sourceKind: "obsidian_import",
		sourceRef: { filePath: path },
	};
}
