/**
 * Memory-context selection (isomorphic, dependency-free).
 *
 * Single source of truth for the order/budget contract that decides which
 * approved memory items get injected into a chat run. Both the server-side
 * injector (`@rox/chat` `buildMemoryContextBlock`) and the desktop "Что увидит
 * агент" read-only preview reuse this, so the preview is guaranteed to match the
 * block that is actually injected.
 *
 * No DB / tRPC / React deps — pure functions over plain rows, runnable in the
 * host-service process, the renderer, web, and mobile alike.
 */

/** Memory categories, mirrored from `@rox/db` (no DB dep here). */
export type MemoryContextCategory =
	| "projects"
	| "identity"
	| "instructions"
	| "career"
	| "general";

/** Minimal shape the selector needs from a `memory_items` row. */
export interface MemoryContextItem {
	category: MemoryContextCategory;
	body: string;
	updatedAt: Date | string;
}

/** Max number of items injected, to bound context cost. */
export const MEMORY_CONTEXT_MAX_ITEMS = 25;

/** Soft character budget for the rendered item bodies, to bound context cost. */
export const MEMORY_CONTEXT_MAX_CHARS = 4000;

/**
 * Categories surfaced first regardless of recency: how-to-work-with-me and
 * who-the-user-is matter on every turn, so they lead the block.
 */
export const MEMORY_CONTEXT_PRIORITY_CATEGORIES: ReadonlySet<MemoryContextCategory> =
	new Set(["instructions", "identity"]);

/**
 * RU headers, matching the MemoryView group labels
 * (`apps/desktop/.../MemoryView/groups.ts` MEMORY_GROUPS) so the injected block
 * reads the same as the UI the user curated.
 */
export const MEMORY_CONTEXT_CATEGORY_HEADERS: Record<
	MemoryContextCategory,
	string
> = {
	projects: "Проекты",
	identity: "Личное",
	instructions: "Предпочтения и правила",
	career: "Карьера и история",
	general: "Общие правила и принципы",
};

/** Fixed display order of category groups inside the rendered block. */
export const MEMORY_CONTEXT_CATEGORY_ORDER: readonly MemoryContextCategory[] = [
	"instructions",
	"identity",
	"projects",
	"career",
	"general",
];

export const MEMORY_CONTEXT_BLOCK_PREAMBLE =
	"Учитывай известные факты о пользователе (его память и предпочтения):";

function toTime(value: Date | string): number {
	const time = value instanceof Date ? value.getTime() : Date.parse(value);
	return Number.isNaN(time) ? 0 : time;
}

/**
 * One item annotated with whether the order/budget contract includes it in the
 * injected context. `body` is trimmed. Items with a blank body are excluded
 * (`included === false`).
 */
export interface MemoryContextSelection<T extends MemoryContextItem> {
	item: T;
	body: string;
	included: boolean;
}

/**
 * Annotate every item with its inclusion decision, in the exact priority +
 * recency order the injector uses. This is the shared core: callers that only
 * want the included items filter `included`; the preview UI renders the whole
 * list and greys out `included === false`.
 *
 * Order: `instructions` + `identity` always first, then everything else
 * most-recent-first (updatedAt desc). Within the priority tier, ordering is also
 * updatedAt desc. Inclusion is then capped by item count AND character budget
 * (whichever binds first); the first non-blank item is always included even if
 * it alone exceeds the budget, so a single long memory is never silently
 * dropped.
 */
export function annotateMemoryContextItems<T extends MemoryContextItem>(
	items: readonly T[],
): MemoryContextSelection<T>[] {
	const sorted = [...items].sort((a, b) => {
		const aPriority = MEMORY_CONTEXT_PRIORITY_CATEGORIES.has(a.category)
			? 1
			: 0;
		const bPriority = MEMORY_CONTEXT_PRIORITY_CATEGORIES.has(b.category)
			? 1
			: 0;
		if (aPriority !== bPriority) return bPriority - aPriority;
		return toTime(b.updatedAt) - toTime(a.updatedAt);
	});

	const result: MemoryContextSelection<T>[] = [];
	let includedCount = 0;
	let usedChars = 0;
	for (const item of sorted) {
		const body = item.body.trim();
		if (!body) {
			result.push({ item, body, included: false });
			continue;
		}
		let included = includedCount < MEMORY_CONTEXT_MAX_ITEMS;
		// Always allow the first kept item even if it alone exceeds the budget, so
		// a single long memory is still injected rather than silently dropped.
		if (
			included &&
			includedCount > 0 &&
			usedChars + body.length > MEMORY_CONTEXT_MAX_CHARS
		) {
			included = false;
		}
		if (included) {
			includedCount += 1;
			usedChars += body.length;
		}
		result.push({ item, body, included });
	}
	return result;
}

/**
 * The included items only, in injection order, with trimmed bodies. This is what
 * `buildMemoryContextBlock` renders into the system block.
 */
export function selectMemoryContextItems<T extends MemoryContextItem>(
	items: readonly T[],
): (T & { body: string })[] {
	return annotateMemoryContextItems(items)
		.filter((entry) => entry.included)
		.map((entry) => ({ ...entry.item, body: entry.body }));
}

/**
 * Build the delimited system block from approved memory items, grouped by
 * category with RU headers. Returns `null` when there is nothing to inject, so
 * the caller is a true no-op for users with no approved memories.
 */
export function buildMemoryContextBlock(
	items: readonly MemoryContextItem[],
): string | null {
	const selected = selectMemoryContextItems(items);
	if (selected.length === 0) return null;

	const grouped = new Map<MemoryContextCategory, string[]>();
	for (const item of selected) {
		const bucket = grouped.get(item.category);
		if (bucket) bucket.push(item.body);
		else grouped.set(item.category, [item.body]);
	}

	const sections: string[] = [];
	for (const category of MEMORY_CONTEXT_CATEGORY_ORDER) {
		const bodies = grouped.get(category);
		if (!bodies || bodies.length === 0) continue;
		const lines = bodies.map((body) => `- ${body}`).join("\n");
		sections.push(`## ${MEMORY_CONTEXT_CATEGORY_HEADERS[category]}\n${lines}`);
	}

	return [
		"<user_memory>",
		MEMORY_CONTEXT_BLOCK_PREAMBLE,
		"",
		sections.join("\n\n"),
		"</user_memory>",
	].join("\n");
}
