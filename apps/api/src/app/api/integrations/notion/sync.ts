/**
 * Pure mapping from Notion pages to `knowledge_documents` insert rows.
 *
 * No I/O lives here — given an already-fetched Notion page (see notion-client)
 * and a small context, it returns the typed insert payload. This keeps the
 * transform unit-testable and lets the job route stay a thin orchestration shell.
 *
 * The job route fetches page block children and passes rendered Markdown by
 * page id. This module stays pure: it maps search result metadata plus
 * already-rendered Markdown into `knowledge_documents` rows.
 *
 * Storage decisions (no migration / no new enum):
 *  - `sourceKind: "file"` reuses an existing `knowledge_source_kind` value.
 *  - `type: "note"` is the default editorial kind.
 *  - `slug` = kebab(title) + "-" + last 8 chars of the Notion page id. The id
 *    suffix guarantees per-org uniqueness even when two pages share a title.
 */

import type { InsertKnowledgeDocument } from "@rox/db/schema";
import type {
	NotionBlock,
	NotionRichText,
	NotionSearchResult,
} from "./notion-client";

/** Context needed to materialize a knowledge document from a Notion page. */
export type NotionMapContext = {
	organizationId: string;
	/** Correlates every row written by one sync run (stored in `sourceRef`). */
	importBatchId: string;
	/** Optional rendered page bodies keyed by Notion page id. */
	markdownByPageId?: ReadonlyMap<string, string>;
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

function richTextToMarkdown(fragments: unknown): string {
	if (!Array.isArray(fragments)) return "";
	return fragments
		.map((fragment) => {
			if (typeof fragment !== "object" || fragment === null) return "";
			const rich = fragment as NotionRichText;
			let text = rich.plain_text ?? "";
			if (!text) return "";
			const annotations = rich.annotations;
			if (annotations?.code) return formatInlineCode(text);
			if (annotations?.bold) text = `**${text}**`;
			if (annotations?.italic) text = `_${text}_`;
			if (annotations?.strikethrough) text = `~~${text}~~`;
			if (rich.href) text = `[${text}](${rich.href})`;
			return text;
		})
		.join("")
		.trim();
}

function richTextToCode(fragments: unknown): string {
	if (!Array.isArray(fragments)) return "";
	return fragments
		.map((fragment) => {
			if (typeof fragment !== "object" || fragment === null) return "";
			const rich = fragment as NotionRichText;
			return rich.plain_text ?? "";
		})
		.join("");
}

function formatInlineCode(text: string): string {
	const fence = text.includes("`") ? "``" : "`";
	return `${fence}${text}${fence}`;
}

function getBlockPayload(block: NotionBlock): Record<string, unknown> | null {
	const payload = block[block.type];
	return typeof payload === "object" && payload !== null
		? (payload as Record<string, unknown>)
		: null;
}

function getRichText(block: NotionBlock): string {
	return richTextToMarkdown(getBlockPayload(block)?.rich_text);
}

function getCodeText(block: NotionBlock): string {
	return richTextToCode(getBlockPayload(block)?.rich_text);
}

function getCaption(payload: Record<string, unknown> | null): string {
	const caption = richTextToMarkdown(payload?.caption);
	return caption.length > 0 ? caption : "Attachment";
}

function getExternalUrl(
	payload: Record<string, unknown> | null,
): string | null {
	const external = payload?.external;
	if (typeof external === "object" && external !== null) {
		const url = (external as Record<string, unknown>).url;
		if (typeof url === "string") return url;
	}
	const file = payload?.file;
	if (typeof file === "object" && file !== null) {
		const url = (file as Record<string, unknown>).url;
		if (typeof url === "string") return url;
	}
	const url = payload?.url;
	return typeof url === "string" ? url : null;
}

function indentMarkdown(markdown: string, spaces: number): string {
	if (!markdown.trim()) return "";
	const prefix = " ".repeat(spaces);
	return markdown
		.split("\n")
		.map((line) => (line.length > 0 ? `${prefix}${line}` : line))
		.join("\n");
}

function renderChildren(block: NotionBlock, depth: number): string {
	return renderNotionBlocksToMarkdown(block.children ?? [], depth + 1);
}

function renderBlockToMarkdown(block: NotionBlock, depth: number): string {
	const payload = getBlockPayload(block);
	const text = getRichText(block);
	const children = renderChildren(block, depth);
	const nested = children ? `\n${indentMarkdown(children, 2)}` : "";

	switch (block.type) {
		case "paragraph":
			return `${text}${nested}`.trim();
		case "heading_1":
			return `# ${text}`.trim();
		case "heading_2":
			return `## ${text}`.trim();
		case "heading_3":
			return `### ${text}`.trim();
		case "bulleted_list_item":
			return `${"  ".repeat(depth)}- ${text}${nested}`.trimEnd();
		case "numbered_list_item":
			return `${"  ".repeat(depth)}1. ${text}${nested}`.trimEnd();
		case "to_do": {
			const checked = payload?.checked === true ? "x" : " ";
			return `${"  ".repeat(depth)}- [${checked}] ${text}${nested}`.trimEnd();
		}
		case "quote":
		case "callout":
			return `> ${text}${nested}`.trimEnd();
		case "toggle":
			return `${text}${nested}`.trim();
		case "code": {
			const language =
				typeof payload?.language === "string" ? payload.language : "";
			return `\`\`\`${language}\n${getCodeText(block).replace(/\n$/, "")}\n\`\`\``;
		}
		case "divider":
			return "---";
		case "child_page":
			return `## ${typeof payload?.title === "string" ? payload.title : "Page"}`;
		case "child_database":
			return `## ${typeof payload?.title === "string" ? payload.title : "Database"}`;
		case "bookmark":
		case "embed":
		case "link_preview": {
			const url = getExternalUrl(payload);
			return url ? `[${url}](${url})` : "";
		}
		case "image":
		case "file":
		case "pdf":
		case "video": {
			const url = getExternalUrl(payload);
			return url ? `[${getCaption(payload)}](${url})` : "";
		}
		default:
			return children;
	}
}

export function renderNotionBlocksToMarkdown(
	blocks: readonly NotionBlock[],
	depth = 0,
): string {
	return blocks
		.map((block) => renderBlockToMarkdown(block, depth))
		.filter((line) => line.trim().length > 0)
		.join("\n\n")
		.trim();
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
 * network, no DB. `markdown` comes from already-rendered page blocks when the
 * sync job supplies a `markdownByPageId` entry.
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
		markdown: ctx.markdownByPageId?.get(page.id) ?? "",
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
