/**
 * Memory injection (memory-injection phase 1).
 *
 * Closes the "memories are write-only" dead loop: the desktop MemoryView curates
 * `memory_items`, but nothing ever read them back into a chat run. This module is
 * the consumer — it pulls the signed-in user's APPROVED memory items and injects
 * them, once per thread, as a delimited system block so every agent run is
 * memory-aware.
 *
 * The order/budget contract (which items get injected, in what order) lives in
 * `@rox/shared/memory-context` so the desktop "Что увидит агент" preview can
 * reuse the exact same selection without any server dependency. This module owns
 * only the injection side effect.
 *
 * Data path: this package runs in the host-service process and has no direct DB
 * access, so it reads through the existing `memory.list` tRPC procedure on the
 * main API (org + user scoping is enforced server-side from the authenticated
 * session — the host passes nothing org/user-related, so it cannot leak across
 * tenants). The injection mechanism is Mastra's first-class
 * `harness.saveSystemReminderMessage`, so we never fork mastracode's prompt
 * builder.
 */

import {
	buildMemoryContextBlock,
	MEMORY_CONTEXT_MAX_CHARS,
	MEMORY_CONTEXT_MAX_ITEMS,
	type MemoryContextCategory,
	type MemoryContextItem,
} from "@rox/shared/memory-context";
import type { AppRouter } from "@rox/trpc";
import type { createTRPCClient } from "@trpc/client";

export {
	buildMemoryContextBlock,
	MEMORY_CONTEXT_MAX_CHARS,
	MEMORY_CONTEXT_MAX_ITEMS,
	type MemoryContextCategory,
	type MemoryContextItem,
};

/** Reminder type tag persisted with the injected system message. */
export const MEMORY_CONTEXT_REMINDER_TYPE = "rox_user_memory";

type ApiClient = ReturnType<typeof createTRPCClient<AppRouter>>;

/**
 * The minimal slice of the agent {@link import("@rox/chat/server/engine").Engine}
 * this consumer needs. Kept as a narrow structural type (rather than the full
 * `Engine`) so the injector stays decoupled and easy to test in isolation; any
 * `Engine` satisfies it structurally.
 */
interface MemoryInjectionEngine {
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
	engine: MemoryInjectionEngine,
	apiClient: ApiClient,
): Promise<void> {
	try {
		const existing = await engine.listMessages({ limit: 1 });
		if (existing.length > 0) return;

		const items = await apiClient.memory.list.query({ status: "approved" });
		const block = buildMemoryContextBlock(items as MemoryContextItem[]);
		if (!block) return;

		await engine.saveSystemReminderMessage({
			message: block,
			reminderType: MEMORY_CONTEXT_REMINDER_TYPE,
			role: "system",
		});
	} catch (error) {
		console.warn("[chat] Memory context injection failed:", error);
	}
}
