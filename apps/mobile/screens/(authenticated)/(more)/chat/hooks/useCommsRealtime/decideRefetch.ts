import type { CommsMessageEvent } from "@rox/shared/comms-events";

/**
 * Pure transport→refresh router for the mobile chat tab's realtime layer — the
 * mobile analog of web `applyCommsStreamEvent.ts`. Kept free of React, env, and
 * fetch imports so the routing rule is unit-testable without booting Expo.
 *
 * Mobile has no React-Query/queryKey cache, so "invalidation" is modeled as
 * calling a hook's `refresh()`; this helper only decides WHICH refreshers to run.
 */

/**
 * The subset of {@link CommsMessageEvent} that actually reaches a client off the
 * wire (the SSE payload is body-less). Re-derived from `@rox/shared` so it stays
 * in lockstep with the server contract.
 */
export type CommsRealtimeEvent = Pick<
	CommsMessageEvent,
	| "organizationId"
	| "threadId"
	| "messageId"
	| "transport"
	| "authorUserId"
	| "at"
>;

export interface RefetchDecision {
	/** Refresh the chat thread list (order + unread badges). */
	refreshThreads: boolean;
	/** Refresh the currently-open chat thread's messages. */
	refreshOpenThread: boolean;
}

/**
 * Decide what the chat tab should refresh for one realtime event.
 *
 * - Any non-`email` transport refreshes the chat thread list (chat reads
 *   `comms.*`; `email` events belong to the Mail tab, which the chat surface
 *   never refreshes).
 * - The open thread is refreshed only when the event targets it AND a thread is
 *   actually open (a missing/empty `threadId` never matches).
 */
export function decideRefetch(
	event: CommsRealtimeEvent,
	ctx: { openThreadId: string | null },
): RefetchDecision {
	if (event.transport === "email") {
		return { refreshThreads: true, refreshOpenThread: false };
	}

	const refreshOpenThread =
		!!event.threadId && event.threadId === ctx.openThreadId;

	return { refreshThreads: true, refreshOpenThread };
}
