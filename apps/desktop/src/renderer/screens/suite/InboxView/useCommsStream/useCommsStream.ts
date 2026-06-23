import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import { useCloudTrpc } from "renderer/lib/api-trpc-react";
import { getAuthToken } from "renderer/lib/auth-client";
import { logger } from "renderer/lib/logger";
import {
	applyCommsStreamEvent,
	type CommsStreamEvent,
	type InboxTransport,
} from "../applyCommsStreamEvent";
import { consumeCommsStream } from "./consumeCommsStream";

/**
 * Live unified-inbox delivery over SSE for the Electron renderer (B-desktop).
 * Mirrors the web `useCommsStream` behavior — refetch the right tRPC caches when
 * a new in-app/mesh/xmpp message or inbound email lands — but the transport is
 * DIFFERENT by necessity: bearer-token `fetch` SSE instead of cookie
 * `EventSource` (see {@link consumeCommsStream} for the rationale).
 *
 * Cache-first (AGENTS.md #9): we INVALIDATE (background refetch while existing
 * rows stay rendered) — never write optimistic rows or blank `data`. The SSE
 * payload is intentionally body-less; the authoritative row comes from the
 * refetch (same contract as web).
 */

export interface UseCommsStreamArgs {
	/** The open thread id for the active tab, or `null` when none is open. */
	openThreadId: string | null;
	/** The active inbox tab. */
	transport: InboxTransport;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

export function useCommsStream({
	openThreadId,
	transport,
}: UseCommsStreamArgs): void {
	const trpc = useCloudTrpc();
	const queryClient = useQueryClient();

	// Keep the latest open thread id + active tab readable inside the long-lived
	// SSE handler without re-opening the stream every time the selection changes.
	const ctxRef = useRef<{
		openThreadId: string | null;
		transport: InboxTransport;
	}>({ openThreadId, transport });
	ctxRef.current = { openThreadId, transport };

	useEffect(() => {
		const abort = new AbortController();
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let attempt = 0;
		let closed = false;

		const onEvent = (event: CommsStreamEvent) => {
			// A successful frame resets the backoff window.
			attempt = 0;
			applyCommsStreamEvent(
				queryClient,
				{
					commsListThreads: () => trpc.comms.listThreads.queryKey({}),
					commsGetThread: ({ threadId }) =>
						trpc.comms.getThread.queryKey({ threadId }),
					mailListThreads: () => trpc.mail.listThreads.queryKey({}),
					mailGetThread: ({ threadId }) =>
						trpc.mail.getThread.queryKey({ threadId }),
				},
				event,
				ctxRef.current,
			);
		};

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

			// Bearer-only renderer: skip while no token exists and let a later
			// connect attempt pick one up (AuthProvider re-sets the token on change).
			const token = getAuthToken();
			if (!token) {
				scheduleReconnect();
				return;
			}

			consumeCommsStream({
				url: `${env.NEXT_PUBLIC_API_URL}/api/comms/stream`,
				token,
				signal: abort.signal,
				onEvent,
			})
				.then(() => {
					// The stream ended without an abort (proxy/idle close) — reconnect
					// so live delivery resumes (no native EventSource auto-retry here).
					scheduleReconnect();
				})
				.catch((error: unknown) => {
					if (abort.signal.aborted) return;
					logger.debug("[InboxView] comms stream error", error);
					scheduleReconnect();
				});
		}

		connect();

		return () => {
			closed = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			abort.abort();
		};
	}, [queryClient, trpc]);
}
