/**
 * Pure mapping from Notion pages to `knowledge_documents` insert rows.
 *
 * No I/O lives here — given an already-fetched Notion page (see notion-client)
 * and a small context, it returns the typed insert payload. This keeps the
 * transform unit-testable and lets the job route stay a thin orchestration shell.
 *
 * Foundation scope: `markdown` is left empty. Converting Notion blocks to
 * markdown requires per-page block fetches (`GET /blocks/{id}/children`) and is
 * deliberately out of scope here — tracked as a TODO below.
 *
 * Storage decisions (no migration / no new enum):
 *  - `sourceKind: "file"` reuses an existing `knowledge_source_kind` value.
 *  - `type: "note"` is the default editorial kind.
 *  - `slug` = kebab(title) + "-" + last 8 chars of the Notion page id. The id
 *    suffix guarantees per-org uniqueness even when two pages share a title.
 */

import type { InsertKnowledgeDocument } from "@rox/db/schema";
import type { NotionSearchResult } from "./notion-client";

/** Context needed to materialize a knowledge document from a Notion page. */
export type NotionMapContext = {
	organizationId: string;
	/** Correlates every row written by one sync run (stored in `sourceRef`). */
	importBatchId: string;
};

/** Fallback title when a page exposes no usable title-type property. */
const UNTITLED = "Untitled";

/** Number of trailing page-id characters appended to the slug for uniqueness. */
const ID_SUFFIX_LENGTH = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Joins Notion rich-text fragments into a plain string. Notion title properties
 * hold an array of rich-text objects, each exposing a `plain_text` field.
 */
function richTextToPlain(fragments: unknown): string {
	if (!Array.isArray(fragments)) return "";
	const parts: string[] = [];
	for (const fragment of fragments) {
		if (isRecord(fragment) && typeof fragment.plain_text === "string") {
			parts.push(fragment.plain_text);
		}
	}
	return parts.join("").trim();
}

/**
 * Extracts the page title from the first title-type property. Notion guarantees
 * exactly one title property per page, but its key name is user-defined, so we
 * scan for `type === "title"` rather than assuming a fixed key. Returns
 * {@link UNTITLED} when no non-empty title is found.
 */
export function extractTitle(page: NotionSearchResult): string {
	const properties = page.properties;
	if (isRecord(properties)) {
		for (const value of Object.values(properties)) {
			if (isRecord(value) && value.type === "title") {
				const title = richTextToPlain(value.title);
				if (title.length > 0) return title;
			}
		}
	}
	return UNTITLED;
}

/**
 * Converts arbitrary text into a kebab-case slug fragment: lowercased, ASCII
 * word runs joined by single hyphens, no leading/trailing hyphens.
 */
export function kebab(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Builds a per-org-unique slug from the title plus the last 8 chars of the page
 * id. Falls back to a `notion-<suffix>` stem when the title kebabs to empty
 * (e.g. a non-Latin title).
 */
export function buildSlug(title: string, pageId: string): string {
	const stem = kebab(title);
	const suffix = pageId.replace(/-/g, "").slice(-ID_SUFFIX_LENGTH);
	return stem.length > 0 ? `${stem}-${suffix}` : `notion-${suffix}`;
}

/**
 * Maps a single Notion page to a `knowledge_documents` insert row. Pure — no
 * network, no DB. `markdown` is empty for the foundation (see file header TODO).
 */
export function mapNotionPageToKnowledgeDoc(
	page: NotionSearchResult,
	ctx: NotionMapContext,
): InsertKnowledgeDocument {
	const title = extractTitle(page);

	return {
		organizationId: ctx.organizationId,
		slug: buildSlug(title, page.id),
		title,
		// TODO(notion-blocks): fetch GET /blocks/{id}/children and render the
		// page body to markdown. Empty for the sync foundation.
		markdown: "",
		sourceKind: "file",
		type: "note",
		sourceRef: {
			importBatchId: ctx.importBatchId,
			// Extra provenance kept on the loose KnowledgeSourceRef jsonb.
			notionPageId: page.id,
			notionUrl: page.url,
			notionLastEditedTime: page.last_edited_time,
		},
	};
}

/**
 * Maps a batch of Notion pages, dropping any object without a usable id. The
 * client already normalizes ids, but this guard keeps the mapper safe when fed
 * raw/unsanitized input.
 */
export function mapNotionPages(
	pages: readonly NotionSearchResult[],
	ctx: NotionMapContext,
): InsertKnowledgeDocument[] {
	return pages
		.filter(
			(page): page is NotionSearchResult =>
				typeof page?.id === "string" && page.id.length > 0,
		)
		.map((page) => mapNotionPageToKnowledgeDoc(page, ctx));
}
