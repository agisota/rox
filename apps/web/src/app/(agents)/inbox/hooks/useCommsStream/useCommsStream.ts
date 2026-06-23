"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

/**
 * Live unified-inbox delivery over SSE (comms realtime, hardening epic).
 *
 * Opens an `EventSource` against the api's `/api/comms/stream` and, on each
 * server-pushed `message` event, refreshes the relevant tRPC caches:
 *   - always invalidate `comms.listThreads` so the inbox reorders + the unread
 *     badge updates;
 *   - if the event targets the currently-open thread, invalidate
 *     `comms.getThread` so the new message appears in the open conversation.
 *
 * Cache-first (AGENTS.md #9): we INVALIDATE (which refetches in the background
 * while existing rows stay rendered) rather than writing optimistic rows — the
 * SSE payload is intentionally body-less, so the authoritative message comes from
 * the refetch. Existing data is never blanked.
 *
 * The server gate (`/api/comms/stream`) only forwards events for threads the
 * caller participates in, so a pushed event is already known to be in-scope; the
 * client still scopes invalidation to the caller's own query keys.
 *
 * Reconnect: native EventSource auto-retries on transient drops; we add a capped
 * exponential backoff on top so a sustained outage doesn't hot-loop. The stream
 * is torn down on unmount.
 *
 * DEFERRED: desktop (trpc-electron observable) + mobile live wiring keep their
 * existing refetch/poll path for now — this slice wires web only.
 */

interface CommsStreamEvent {
	organizationId: string;
	threadId: string;
	messageId: string;
	transport: string;
	authorUserId: string | null;
	at: number;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

export function useCommsStream(openThreadId: string | null): void {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	// Keep the latest open thread id readable inside the long-lived SSE handler
	// without re-opening the stream every time the selection changes.
	const openThreadIdRef = useRef<string | null>(openThreadId);
	openThreadIdRef.current = openThreadId;

	useEffect(() => {
		let source: EventSource | null = null;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let attempt = 0;
		let closed = false;

		const onMessage = (raw: MessageEvent<string>) => {
			// A successful frame resets the backoff window.
			attempt = 0;

			let event: CommsStreamEvent;
			try {
				event = JSON.parse(raw.data) as CommsStreamEvent;
			} catch {
				return;
			}

			// Inbox list always refreshes (ordering + unread badge).
			void queryClient.invalidateQueries({
				queryKey: trpc.comms.listThreads.queryKey({}),
			});

			// The open conversation refreshes only when the event targets it.
			if (event.threadId && event.threadId === openThreadIdRef.current) {
				void queryClient.invalidateQueries({
					queryKey: trpc.comms.getThread.queryKey({
						threadId: event.threadId,
					}),
				});
			}
		};

		const connect = () => {
			if (closed) return;

			source = new EventSource(`${env.NEXT_PUBLIC_API_URL}/api/comms/stream`, {
				withCredentials: true,
			});
			source.addEventListener("message", onMessage as EventListener);

			source.onerror = () => {
				// Close the broken source and schedule a capped exponential backoff
				// reconnect rather than relying on the fixed native retry interval.
				source?.close();
				source = null;
				if (closed) return;

				attempt += 1;
				const delay = Math.min(
					BASE_BACKOFF_MS * 2 ** (attempt - 1),
					MAX_BACKOFF_MS,
				);
				reconnectTimer = setTimeout(connect, delay);
			};
		};

		connect();

		return () => {
			closed = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			source?.removeEventListener("message", onMessage as EventListener);
			source?.close();
		};
	}, [queryClient, trpc]);
}
