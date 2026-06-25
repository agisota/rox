import type { QueryClient } from "@tanstack/react-query";

/**
 * MIRROR of apps/web/src/app/(agents)/inbox/hooks/useCommsStream/applyCommsStreamEvent.ts
 * — keep the two in sync. There is no shared client-utils package between
 * apps/web and apps/desktop (and packages/trpc can't host React-free client
 * utils), so this is an intentional 1:1 copy.
 *
 * SSE event routing for the unified inbox. Kept in its own module — free of
 * React, env, and tRPC-client imports — so the transport→query-target mapping is
 * unit-testable without booting the renderer's client env.
 */

export interface CommsStreamEvent {
	organizationId: string;
	threadId: string;
	messageId: string;
	transport: string;
	authorUserId: string | null;
	at: number;
}

/** Which inbox tab is currently showing (drives open-thread refresh routing). */
export type InboxTransport = "chat" | "mail";

/** The tRPC query-key factories the invalidation routing needs (subset). */
export interface CommsStreamQueryKeys {
	commsListThreads: () => readonly unknown[];
	commsGetThread: (input: { threadId: string }) => readonly unknown[];
	mailListThreads: () => readonly unknown[];
	mailGetThread: (input: { threadId: string }) => readonly unknown[];
	/**
	 * Query-key factories the "Система" (`transport: "system"`) slice refetches.
	 * OPTIONAL so existing chat/mail-only callers stay source-compatible — a
	 * caller without a system surface simply omits it and `system` events become
	 * no-ops instead of leaking into the chat (`comms.*`) caches.
	 */
	systemListThreads?: () => readonly unknown[];
}

/**
 * Route one SSE event to the correct tRPC cache invalidations.
 *
 * - `email` events refresh the Mail tab's `mail.*` queries (the Mail tab reads
 *   `mail.*`, NOT `comms.*`, so without this it would never live-update); the
 *   open mail thread is also refreshed when targeted.
 * - `system` events drive the "Система" aggregator. STRICTLY invalidate-only:
 *   we refetch the system list (so a freshly highlighted row + the unread badge
 *   re-derive from authoritative data) and never write optimistic rows or touch
 *   an open thread — the body-less SSE frame carries no thread payload. System
 *   events must NOT fall through to the chat (`comms.*`) branch.
 * - every other transport (in-app/mesh/xmpp) refreshes the chat `comms.*`
 *   queries; the open chat thread is refreshed only when targeted.
 *
 * The open thread is refreshed only when the event targets it AND the open tab
 * matches the event's transport.
 */
export function applyCommsStreamEvent(
	queryClient: Pick<QueryClient, "invalidateQueries">,
	keys: CommsStreamQueryKeys,
	event: CommsStreamEvent,
	ctx: { openThreadId: string | null; transport: InboxTransport },
): void {
	if (event.transport === "email") {
		void queryClient.invalidateQueries({ queryKey: keys.mailListThreads() });
		if (
			ctx.transport === "mail" &&
			event.threadId &&
			event.threadId === ctx.openThreadId
		) {
			void queryClient.invalidateQueries({
				queryKey: keys.mailGetThread({ threadId: event.threadId }),
			});
		}
		return;
	}

	if (event.transport === "system") {
		// Invalidate-only: refetch the system list so the highlighted row + unread
		// badge re-derive from source. No optimistic rows, no open-thread refresh.
		if (keys.systemListThreads) {
			void queryClient.invalidateQueries({
				queryKey: keys.systemListThreads(),
			});
		}
		return;
	}

	void queryClient.invalidateQueries({ queryKey: keys.commsListThreads() });
	if (
		ctx.transport === "chat" &&
		event.threadId &&
		event.threadId === ctx.openThreadId
	) {
		void queryClient.invalidateQueries({
			queryKey: keys.commsGetThread({ threadId: event.threadId }),
		});
	}
}
