import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import type { InboxItem } from "../types";
import { mergeInboxItems } from "../utils/normalizeInbox";
import { sumThreadUnread } from "../utils/sumThreadUnread";

/**
 * The unified "All" stream backing the inbox list. Reads both transports
 * (`comms.listThreads` + `mail.listThreads`) and merges them into one sorted,
 * de-duplicated {@link InboxItem} array via the pure {@link mergeInboxItems}.
 *
 * Cache-first (AGENTS.md #9): both queries render their cached rows immediately;
 * the empty/skeleton states only key off the *combined* first-load condition so
 * a cached transport never blanks while the other is still fetching.
 */
export interface UseInboxDataResult {
	items: InboxItem[];
	/** Total unread across all chat threads (drives the rail + sidebar badge). */
	totalUnread: number;
	/** First-load (no cached rows in either transport yet). */
	isInitialLoading: boolean;
	/** Both transports resolved with zero rows. */
	isEmpty: boolean;
	/** Either transport failed. */
	isError: boolean;
	errorMessage: string | null;
	refetch: () => void;
}

export function useInboxData(): UseInboxDataResult {
	const trpc = useTRPC();

	const chatQuery = useQuery(
		trpc.comms.listThreads.queryOptions({ limit: 50 }),
	);
	const mailQuery = useQuery(trpc.mail.listThreads.queryOptions({ limit: 50 }));

	const chatThreads = chatQuery.data ?? [];
	const mailThreads = mailQuery.data ?? [];

	const items = useMemo(
		() => mergeInboxItems(chatThreads, mailThreads),
		[chatThreads, mailThreads],
	);

	const totalUnread = useMemo(
		() => sumThreadUnread(chatThreads),
		[chatThreads],
	);

	const isInitialLoading =
		items.length === 0 &&
		(chatQuery.isLoading || mailQuery.isLoading) &&
		!(chatQuery.isError || mailQuery.isError);

	const isEmpty =
		items.length === 0 && chatQuery.isSuccess && mailQuery.isSuccess;

	const isError = chatQuery.isError || mailQuery.isError;
	const errorMessage =
		(chatQuery.error?.message ?? mailQuery.error?.message) || null;

	return {
		items,
		totalUnread,
		isInitialLoading,
		isEmpty,
		isError,
		errorMessage,
		refetch: () => {
			void chatQuery.refetch();
			void mailQuery.refetch();
		},
	};
}
