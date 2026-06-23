import type { QueryClient } from "@tanstack/react-query";

/**
 * SSE event routing for the unified inbox (FIX 3). Kept in its own module — free
 * of React, env, and tRPC-client imports — so the transport→query-target mapping
 * is unit-testable without booting the web app's client env.
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
}

/**
 * Route one SSE event to the correct tRPC cache invalidations. `email` events
 * refresh the Mail tab's `mail.*` queries (the Mail tab reads `mail.*`, NOT
 * `comms.*`, so without this it would never live-update); every other transport
 * refreshes the chat `comms.*` queries. The open thread is refreshed only when
 * the event targets it AND the open tab matches the event's transport.
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
