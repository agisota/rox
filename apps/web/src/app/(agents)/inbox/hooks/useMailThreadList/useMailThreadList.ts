"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

/**
 * The caller's `<handle>@rox.one` mailbox threads (cache-first per AGENTS.md #9).
 *
 * Wraps `mail.listThreads` (owner + org scoped server-side). Threads render the
 * moment cached rows exist; `isInitialLoading` only gates the empty-first-load
 * skeleton, never blanks already-rendered rows on a refetch.
 */
export function useMailThreadList(limit?: number) {
	const trpc = useTRPC();
	const query = useQuery(trpc.mail.listThreads.queryOptions({ limit }));

	const threads = query.data ?? [];

	return {
		threads,
		/** True only on the very first load with no cached rows yet. */
		isInitialLoading: query.isLoading && threads.length === 0,
		isError: query.isError,
		refetch: query.refetch,
	};
}

export type MailInboxThread = ReturnType<
	typeof useMailThreadList
>["threads"][number];
