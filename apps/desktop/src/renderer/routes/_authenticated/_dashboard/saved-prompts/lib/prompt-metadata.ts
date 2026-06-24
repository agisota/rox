import type { PromptMetadata, RawSavedPrompt } from "./types";

/**
 * Hidden metadata codec for saved prompts.
 *
 * WHY: the local `saved_prompts` table only has {id,title,body,createdAt,
 * updatedAt} and we cannot add columns from this surface. To deliver a real
 * library (favorites, tags, usage) without a shared schema migration, we append
 * a single fenced, HTML-comment-wrapped JSON block to the END of the `body`
 * text. It is invisible in any markdown renderer, survives the existing
 * `create`/`update` mutations untouched, and is stripped before the body is
 * ever shown or edited. Old rows with no block decode to empty defaults; a
 * future real migration can read these and drop the block. Pure + framework
 * agnostic so it can move to `@rox/shared` later.
 */

const BLOCK_OPEN = "<!--rox:meta";
const BLOCK_CLOSE = "-->";

/** Matches our trailing metadata block (and the blank lines before it). */
const BLOCK_RE = /\n*<!--rox:meta\s*([\s\S]*?)-->\s*$/;

export const EMPTY_METADATA: PromptMetadata = {
	tags: [],
	favorite: false,
	useCount: 0,
	lastUsedAt: null,
};

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

function coerceMetadata(value: unknown): PromptMetadata {
	if (typeof value !== "object" || value === null) return { ...EMPTY_METADATA };
	const record = value as Record<string, unknown>;
	const tags = Array.isArray(record.tags)
		? normalizeTags(
				record.tags.filter((t): t is string => typeof t === "string"),
			)
		: [];
	const useCount =
		typeof record.useCount === "number" && Number.isFinite(record.useCount)
			? Math.max(0, Math.floor(record.useCount))
			: 0;
	const lastUsedAt =
		typeof record.lastUsedAt === "number" && Number.isFinite(record.lastUsedAt)
			? record.lastUsedAt
			: null;
	return {
		tags,
		favorite: record.favorite === true,
		useCount,
		lastUsedAt,
	};
}

/**
 * Split a stored body into its clean prompt text and decoded metadata.
 * Tolerant: malformed/absent block → clean body unchanged + empty metadata.
 */
export function decodeBody(stored: string): {
	body: string;
	metadata: PromptMetadata;
} {
	const match = stored.match(BLOCK_RE);
	if (!match) {
		return { body: stored, metadata: { ...EMPTY_METADATA } };
	}
	const body = stored.slice(0, match.index ?? 0);
	let metadata: PromptMetadata = { ...EMPTY_METADATA };
	try {
		metadata = coerceMetadata(JSON.parse(match[1] ?? "{}"));
	} catch {
		// Corrupt block → treat as no metadata but still strip it from the body.
	}
	return { body, metadata };
}

/** True when the metadata is all-default and need not be persisted. */
function isEmptyMetadata(metadata: PromptMetadata): boolean {
	return (
		metadata.tags.length === 0 &&
		!metadata.favorite &&
		metadata.useCount === 0 &&
		metadata.lastUsedAt === null
	);
}

/**
 * Re-attach metadata to a clean body for persistence. Strips any pre-existing
 * block first (idempotent), then appends a fresh one unless metadata is empty.
 */
export function encodeBody(
	cleanBody: string,
	metadata: PromptMetadata,
): string {
	const base = cleanBody.replace(BLOCK_RE, "");
	if (isEmptyMetadata(metadata)) return base;
	const payload = JSON.stringify({
		tags: metadata.tags,
		favorite: metadata.favorite,
		useCount: metadata.useCount,
		lastUsedAt: metadata.lastUsedAt,
	});
	const trimmed = base.replace(/\s+$/, "");
	return `${trimmed}\n\n${BLOCK_OPEN} ${payload} ${BLOCK_CLOSE}`;
}

/** Strip the metadata block from an arbitrary string (for safe display/copy). */
export function stripMetadataBlock(stored: string): string {
	return stored.replace(BLOCK_RE, "");
}

/** Convenience: decode a raw DB row's body + merge its real timestamps. */
export function decodeRow(row: RawSavedPrompt): {
	body: string;
	metadata: PromptMetadata;
} {
	return decodeBody(row.body);
}
