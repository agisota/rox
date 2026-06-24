import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";
import { env } from "renderer/env.renderer";
import { useCloudTrpc } from "renderer/lib/api-trpc-react";
import { getAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { logger } from "renderer/lib/logger";
import { consumeCommsStream } from "renderer/screens/suite/InboxView/useCommsStream/consumeCommsStream";
import { addNotification } from "renderer/stores/notification-feed";
import { NOTIFICATION_EVENTS } from "shared/constants";
import type { AgentLifecycleEvent } from "shared/notification-types";
import { mapAgentLifecycle, mapCommsEnvelope } from "./lib/mapEvents";

/**
 * Feeds the global top-bar notification bell from the two REAL live event seams
 * already present in the renderer — it produces no data of its own and polls
 * nothing:
 *
 *   1. The comms SSE stream (`/api/comms/stream`, bearer `fetch` + ReadableStream
 *      via {@link consumeCommsStream}). Each body-less frame
 *      (`{transport, threadId, messageId, …}`) becomes a "new mail" (transport
 *      `email`) or "new message" (`inapp`/`mesh`/`xmpp`) feed entry. This is the
 *      same wire the InboxView already consumes; we add a second listener rather
 *      than reroute the existing one, so inbox live-invalidation is untouched.
 *
 *   2. `electronTrpc.notifications.subscribe` — the agent-lifecycle hook stream.
 *      `Stop` → "agent finished"; `PermissionRequest`/`PendingQuestion` →
 *      "agent needs your input". The existing `useAgentHookListener` /
 *      `V2NotificationController` consume the SAME subscription for pane-status
 *      and chimes; a tRPC subscription fans out to every `useSubscription`, so an
 *      extra consumer here is additive and does not disturb them.
 *
 * Titles are enriched opportunistically from the React Query cache (the mail /
 * comms `listThreads` rows the inbox already fetched) — a cache *read* only, so
 * this never triggers a network request and degrades to a static RU label when
 * the thread is not cached. Renders nothing; it is a pure side-effect sibling to
 * the TopBar bell, mounted once at the dashboard layout.
 */
export function NotificationBellController(): null {
	const trpc = useCloudTrpc();
	const queryClient = useQueryClient();

	// Resolve a thread title from whatever `listThreads` page is already cached.
	// Cache-read only (AGENTS.md #9: never fetch from a notification side-effect).
	const resolveThreadTitle = useEffectEvent(
		(source: "mail" | "chat", threadId: string): string | null => {
			try {
				if (source === "mail") {
					const rows = queryClient.getQueryData(
						trpc.mail.listThreads.queryKey({}),
					) as
						| ReadonlyArray<{ id: string; subjectNorm?: string | null }>
						| undefined;
					const subject = rows
						?.find((row) => row.id === threadId)
						?.subjectNorm?.trim();
					return subject || null;
				}
				const rows = queryClient.getQueryData(
					trpc.comms.listThreads.queryKey({}),
				) as ReadonlyArray<{ id: string; subject?: string | null }> | undefined;
				const subject = rows
					?.find((row) => row.id === threadId)
					?.subject?.trim();
				return subject || null;
			} catch {
				return null;
			}
		},
	);

	// --- Seam 1: comms SSE → mail / chat entries -----------------------------
	useEffect(() => {
		const abort = new AbortController();
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let attempt = 0;
		let closed = false;
		const BASE_BACKOFF_MS = 1_000;
		const MAX_BACKOFF_MS = 30_000;

		const scheduleReconnect = () => {
			if (closed) return;
			attempt += 1;
			const delay = Math.min(
				BASE_BACKOFF_MS * 2 ** (attempt - 1),
				MAX_BACKOFF_MS,
			);
			reconnectTimer = setTimeout(connect, delay);
		};

		function connect() {
			if (closed) return;
			const token = getAuthToken();
			if (!token) {
				scheduleReconnect();
				return;
			}
			consumeCommsStream({
				url: `${env.NEXT_PUBLIC_API_URL}/api/comms/stream`,
				token,
				signal: abort.signal,
				onEvent: (event) => {
					attempt = 0;
					const input = mapCommsEnvelope(event, resolveThreadTitle);
					if (input) addNotification(input);
				},
			})
				.then(scheduleReconnect)
				.catch((error: unknown) => {
					if (abort.signal.aborted) return;
					logger.debug("[NotificationBell] comms stream error", error);
					scheduleReconnect();
				});
		}

		connect();

		return () => {
			closed = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			abort.abort();
		};
	}, []);

	// --- Seam 2: agent lifecycle hook → agent / review entries ---------------
	const handleAgentLifecycle = useEffectEvent(
		(event: { type: string; data?: AgentLifecycleEvent | unknown }) => {
			if (event.type !== NOTIFICATION_EVENTS.AGENT_LIFECYCLE) return;
			const data = event.data as AgentLifecycleEvent | undefined;
			if (!data) return;
			const input = mapAgentLifecycle(data);
			if (input) addNotification(input);
		},
	);

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: handleAgentLifecycle,
	});

	return null;
}
