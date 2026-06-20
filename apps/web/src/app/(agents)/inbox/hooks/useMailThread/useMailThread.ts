"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useTRPC } from "@/trpc/react";

/**
 * Load one mail thread (`mail.getThread`) and mark its unread messages read.
 *
 * Cache-first (AGENTS.md #9): the thread payload renders from cache while a
 * refetch is in flight; `isInitialLoading` only gates the empty-first-load
 * skeleton. On open, every still-unread message in the thread is flushed through
 * `mail.markRead` (per-message, idempotent on the server) and the inbox list is
 * invalidated so unread badges clear. The effect keys on the comma-joined set of
 * unread ids (`unreadKey`) so re-selecting a fully-read thread does not re-fire;
 * the actual id list + mutation are read through a ref to keep the dependency set
 * stable.
 */
export function useMailThread(threadId: string | null) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const query = useQuery({
		...trpc.mail.getThread.queryOptions({ threadId: threadId ?? "" }),
		enabled: Boolean(threadId),
	});

	const markRead = useMutation(trpc.mail.markRead.mutationOptions());

	const messages = query.data?.messages ?? [];
	const unreadIds = messages
		.filter((m) => !m.isRead)
		.map((m) => m.id)
		.sort();
	const unreadKey = unreadIds.join(",");

	// Latest values read inside the effect without widening its dependency set.
	const flushRef = useRef<() => void>(() => {});
	flushRef.current = () => {
		if (!threadId || unreadIds.length === 0) return;
		Promise.all(
			unreadIds.map((messageId) =>
				markRead.mutateAsync({ messageId, isRead: true }),
			),
		)
			.then(() => {
				void queryClient.invalidateQueries({
					queryKey: trpc.mail.listThreads.queryKey({}),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.mail.getThread.queryKey({ threadId }),
				});
			})
			.catch((error: unknown) => {
				// Non-fatal: reading the thread already succeeded. Allow a retry.
				console.error("[useMailThread] markRead failed", error);
				lastMarkedRef.current = null;
			});
	};

	const lastMarkedRef = useRef<string | null>(null);

	useEffect(() => {
		if (!threadId || !unreadKey) return;
		const key = `${threadId}:${unreadKey}`;
		if (lastMarkedRef.current === key) return;
		lastMarkedRef.current = key;
		flushRef.current();
	}, [threadId, unreadKey]);

	return {
		thread: query.data?.thread ?? null,
		messages,
		isInitialLoading: query.isLoading && Boolean(threadId) && !query.data,
		isError: query.isError,
		refetch: query.refetch,
	};
}
