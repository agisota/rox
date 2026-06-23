"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useTRPC } from "@/trpc/react";

/**
 * Load one thread (messages + participants) and mark it read on open.
 *
 * Cache-first (AGENTS.md #9): the thread payload renders from cache while a
 * refetch is in flight; `isInitialLoading` only gates the empty-first-load
 * skeleton. When messages arrive, the latest message id is written as the
 * caller's read watermark via `comms.markRead` (fire-and-forget, idempotent per
 * the server), then the inbox list is invalidated so the unread badge clears.
 *
 * The mark-read effect keys on `(threadId, latestMessageId)` so re-selecting the
 * same thread without new messages does not re-fire, but a freshly arrived
 * message does advance the watermark.
 */
export function useThread(threadId: string | null) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const query = useQuery({
		...trpc.comms.getThread.queryOptions({ threadId: threadId ?? "" }),
		// Disabled until a thread is actually selected.
		enabled: Boolean(threadId),
	});

	const markRead = useMutation(trpc.comms.markRead.mutationOptions());

	const messages = query.data?.messages ?? [];
	const participants = query.data?.participants ?? [];
	const latestMessageId = messages.at(-1)?.id ?? null;

	// Avoid re-marking the same watermark repeatedly.
	const lastMarkedRef = useRef<string | null>(null);

	useEffect(() => {
		if (!threadId || !latestMessageId) return;
		const key = `${threadId}:${latestMessageId}`;
		if (lastMarkedRef.current === key) return;
		lastMarkedRef.current = key;

		markRead.mutate(
			{ threadId, lastReadMessageId: latestMessageId },
			{
				onSuccess: () => {
					// Refresh the inbox so unread indicators reflect the new watermark.
					void queryClient.invalidateQueries({
						queryKey: trpc.comms.listThreads.queryKey({}),
					});
				},
				onError: (error) => {
					// Non-fatal: reading the thread already succeeded. Allow a retry.
					console.error("[useThread] markRead failed", error);
					lastMarkedRef.current = null;
				},
			},
		);
	}, [threadId, latestMessageId, markRead, queryClient, trpc]);

	return {
		thread: query.data?.thread ?? null,
		messages,
		participants,
		isInitialLoading: query.isLoading && Boolean(threadId) && !query.data,
		isError: query.isError,
		refetch: query.refetch,
	};
}

export type ThreadMessage = NonNullable<
	ReturnType<typeof useThread>["messages"]
>[number];
export type ThreadParticipant = NonNullable<
	ReturnType<typeof useThread>["participants"]
>[number];
