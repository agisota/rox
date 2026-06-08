/**
 * `KnowledgeSource` — the storage-agnostic contract the notebook reads through.
 *
 * The DB-backed implementation (in `@rox/trpc`) is primary; a flat-file source
 * (`FileKnowledgeSource`, reading `apps/web/content/knowledge`) is the fallback
 * used when no org context / database is available (e.g. static docs preview).
 */

import type {
	KnowledgeBacklink,
	KnowledgeDocument,
	KnowledgeListFilter,
	KnowledgeSearchResult,
	KnowledgeUpsertInput,
} from "./types";

export interface KnowledgeSource {
	/** List documents, optionally filtered by type/tag/project. */
	list(filter?: KnowledgeListFilter): Promise<KnowledgeDocument[]>;
	/** Fetch a single document by slug, or null when missing. */
	get(slug: string): Promise<KnowledgeDocument | null>;
	/** Full-text-ish search over title/markdown/tags. */
	search(
		query: string,
		filter?: KnowledgeListFilter,
	): Promise<KnowledgeSearchResult[]>;
	/** Create or update a document (by id or slug). */
	upsert(input: KnowledgeUpsertInput): Promise<KnowledgeDocument>;
	/** Documents that link to the given slug (incoming backlinks). */
	resolveBacklinks(slug: string): Promise<KnowledgeBacklink[]>;
}

/** Lightweight scoring helper shared by in-memory/file search implementations. */
export function scoreDocument(
	doc: Pick<KnowledgeDocument, "title" | "markdown" | "tags">,
	query: string,
): number {
	const q = query.trim().toLowerCase();
	if (!q) return 0;
	const title = doc.title.toLowerCase();
	const body = (doc.markdown ?? "").toLowerCase();
	const tags = doc.tags.map((t) => t.toLowerCase());

	let score = 0;
	if (title === q) score += 1;
	else if (title.includes(q)) score += 0.6;
	if (tags.includes(q)) score += 0.4;
	if (body.includes(q)) score += 0.3;
	return Math.min(score, 1);
}
