import type { RouterOutputs } from "@rox/trpc";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/trpc/client";

export type MailThread = RouterOutputs["mail"]["listThreads"][number];

interface UseMailThreadsResult {
	threads: MailThread[];
	isLoading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

/** The caller's `<handle>@rox.one` mailbox threads, newest-first. */
export function useMailThreads(): UseMailThreadsResult {
	const [threads, setThreads] = useState<MailThread[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setError(null);
		try {
			const result = await apiClient.mail.listThreads.query();
			setThreads(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load mail");
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
