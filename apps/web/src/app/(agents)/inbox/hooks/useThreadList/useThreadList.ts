"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

/**
 * Unified-inbox thread list (cache-first per AGENTS.md #9).
 *
 * Wraps `comms.listThreads`. Today this is the in-app transport only; when the
 * email/XMPP/mesh adapters land (D2/D3/D5) the same query surfaces them with no
 * UI change. The component renders `threads` immediately whenever it is
 * populated and only treats `isLoading` as a skeleton signal when empty.
 */
export function useThreadList(limit?: number) {
	const trpc = useTRPC();
	const query = useQuery(trpc.comms.listThreads.queryOptions({ limit }));

	const threads = query.data ?? [];

	return {
		threads,
		/** True only on the very first load with no cached rows yet. */
		isInitialLoading: query.isLoading && threads.length === 0,
		isError: query.isError,
		refetch: query.refetch,
	};
}

export type InboxThread = ReturnType<typeof useThreadList>["threads"][number];
