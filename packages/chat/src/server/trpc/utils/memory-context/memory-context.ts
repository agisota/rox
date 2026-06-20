/**
 * Memory injection (memory-injection phase 1).
 *
 * Closes the "memories are write-only" dead loop: the desktop MemoryView curates
 * `memory_items`, but nothing ever read them back into a chat run. This module is
 * the consumer — it pulls the signed-in user's APPROVED memory items and injects
 * them, once per thread, as a delimited system block so every agent run is
 * memory-aware.
 *
 * Data path: this package runs in the host-service process and has no direct DB
 * access, so it reads through the existing `memory.list` tRPC procedure on the
 * main API (org + user scoping is enforced server-side from the authenticated
 * session — the host passes nothing org/user-related, so it cannot leak across
 * tenants). The injection mechanism is Mastra's first-class
 * `harness.saveSystemReminderMessage`, so we never fork mastracode's prompt
 * builder.
 */

import type { AppRouter } from "@rox/trpc";
import type { createTRPCClient } from "@trpc/client";

/** Memory categories, mirrored from `@rox/db` (no DB dep in this package). */
export type MemoryContextCategory =
	| "projects"
	| "identity"
	| "instructions"
	| "career"
	| "general";

/** Minimal shape the builder needs from a `memory_items` row. */
export interface MemoryContextItem {
	category: MemoryContextCategory;
	body: string;
	updatedAt: Date | string;
}

/** Max number of items injected, to bound context cost. */
export const MEMORY_CONTEXT_MAX_ITEMS = 25;

/** Soft character budget for the rendered item bodies, to bound context cost. */
export const MEMORY_CONTEXT_MAX_CHARS = 4000;

/** Reminder type tag persisted with the injected system message. */
export const MEMORY_CONTEXT_REMINDER_TYPE = "rox_user_memory";

/**
 * Categories surfaced first regardless of recency: how-to-work-with-me and
 * who-the-user-is matter on every turn, so they lead the block.
 */
const PRIORITY_CATEGORIES: ReadonlySet<MemoryContextCategory> = new Set([
	"instructions",
	"identity",
]);

/**
 * RU headers, matching the MemoryView group labels
 * (`apps/desktop/.../MemoryView/groups.ts` MEMORY_GROUPS) so the injected block
 * reads the same as the UI the user curated.
 */
const CATEGORY_HEADERS: Record<MemoryContextCategory, string> = {
	projects: "Проекты",
	identity: "Личное",
	instructions: "Предпочтения и правила",
	career: "Карьера и история",
	general: "Общие правила и принципы",
};

/** Fixed display order of category groups inside the rendered block. */
const CATEGORY_ORDER: readonly MemoryContextCategory[] = [
	"instructions",
	"identity",
	"projects",
	"career",
	"general",
];

const BLOCK_PREAMBLE =
	"Учитывай известные факты о пользователе (его память и предпочтения):";

function toTime(value: Date | string): number {
	const time = value instanceof Date ? value.getTime() : Date.parse(value);
	return Number.isNaN(time) ? 0 : time;
}

/**
 * Order approved items per contract: `instructions` + `identity` always first,
 * then everything else most-recent-first (updatedAt desc). Within the priority
 * tier, ordering is also updatedAt desc. Then cap by item count AND character
 * budget (whichever binds first), so a few huge memories can't blow the budget.
 */
function selectItems(items: readonly MemoryContextItem[]): MemoryContextItem[] {
	const sorted = [...items].sort((a, b) => {
		const aPriority = PRIORITY_CATEGORIES.has(a.category) ? 1 : 0;
		const bPriority = PRIORITY_CATEGORIES.has(b.category) ? 1 : 0;
		if (aPriority !== bPriority) return bPriority - aPriority;
		return toTime(b.updatedAt) - toTime(a.updatedAt);
	});

	const selected: MemoryContextItem[] = [];
	let usedChars = 0;
	for (const item of sorted) {
		if (selected.length >= MEMORY_CONTEXT_MAX_ITEMS) break;
		const body = item.body.trim();
		if (!body) continue;
		// Always allow the first item even if it alone exceeds the budget, so a
		// single long memory is still injected rather than silently dropped.
		if (
			selected.length > 0 &&
			usedChars + body.length > MEMORY_CONTEXT_MAX_CHARS
		)
			continue;
		selected.push({ ...item, body });
		usedChars += body.length;
	}
	return selected;
}

/**
 * Build the delimited system block from approved memory items, grouped by
 * category with RU headers. Returns `null` when there is nothing to inject, so
 * the caller is a true no-op for users with no approved memories.
 */
export function buildMemoryContextBlock(
	items: readonly MemoryContextItem[],
): string | null {
	const selected = selectItems(items);
	if (selected.length === 0) return null;

	const grouped = new Map<MemoryContextCategory, string[]>();
	for (const item of selected) {
		const bucket = grouped.get(item.category);
		if (bucket) bucket.push(item.body);
		else grouped.set(item.category, [item.body]);
	}

	const sections: string[] = [];
	for (const category of CATEGORY_ORDER) {
		const bodies = grouped.get(category);
		if (!bodies || bodies.length === 0) continue;
		const lines = bodies.map((body) => `- ${body}`).join("\n");
		sections.push(`## ${CATEGORY_HEADERS[category]}\n${lines}`);
	}

	return [
		"<user_memory>",
		BLOCK_PREAMBLE,
		"",
		sections.join("\n\n"),
		"</user_memory>",
	].join("\n");
}

type ApiClient = ReturnType<typeof createTRPCClient<AppRouter>>;

interface MemoryInjectionHarness {
	listMessages(options?: { limit?: number }): Promise<unknown[]>;
	saveSystemReminderMessage(args: {
		message: string;
		reminderType: string;
		role?: "user" | "assistant" | "system";
		metadata?: Record<string, unknown>;
	}): Promise<unknown>;
}

/**
 * Inject the approved-memory block into a chat thread, once per thread.
 *
 * Idempotency: gated on an empty thread (no persisted messages yet), so the
 * block lands ahead of the user's first message and is NOT re-injected on every
 * turn — once saved it stays in the thread's context for the whole conversation.
 *
 * Best-effort: any failure (older API without `memory.list`, transport error,
 * harness quirk) is swallowed. A chat message must always send regardless of
 * whether memory injection succeeds — mirrors the fire-and-forget pattern used
 * for title generation and the pipeline event relay.
 */
export async function injectMemoryContext(
	harness: MemoryInjectionHarness,
	apiClient: ApiClient,
): Promise<void> {
	try {
		const existing = await harness.listMessages({ limit: 1 });
		if (existing.length > 0) return;

		const items = await apiClient.memory.list.query({ status: "approved" });
		const block = buildMemoryContextBlock(items as MemoryContextItem[]);
		if (!block) return;

		await harness.saveSystemReminderMessage({
			message: block,
			reminderType: MEMORY_CONTEXT_REMINDER_TYPE,
			role: "system",
		});
	} catch (error) {
		console.warn("[chat] Memory context injection failed:", error);
	}
}
