import type { RouterOutputs } from "@rox/trpc";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/trpc/client";

export type CommsThread = RouterOutputs["comms"]["listThreads"][number];

interface UseCommsThreadsResult {
	threads: CommsThread[];
	isLoading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

/**
 * The caller's comms inbox threads (newest-first), via the imperative tRPC
 * pattern Mail uses (`apiClient.comms.listThreads.query()` + local state + pull-
 * to-refresh). comms is NOT in the mobile Electric collections, so there is no
 * live-query/cache-first TanStack path for it here. Cache-first interpretation:
 * existing `threads` stay rendered while a refresh is in flight — `load()` never
 * blanks the list on reload (it only replaces on success).
 */
export function useCommsThreads(): UseCommsThreadsResult {
	const [threads, setThreads] = useState<CommsThread[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setError(null);
		try {
			const result = await apiClient.comms.listThreads.query();
			setThreads(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load chats");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		setIsLoading(true);
		void load();
	}, [load]);

	const refresh = useCallback(async () => {
		await load();
	}, [load]);

	return { threads, isLoading, error, refresh };
}
