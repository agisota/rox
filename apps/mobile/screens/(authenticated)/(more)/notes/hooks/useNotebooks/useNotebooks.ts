import type { RouterOutputs } from "@rox/trpc";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/trpc/client";

export type Notebook = RouterOutputs["notes"]["listNotebooks"][number];

interface UseNotebooksResult {
	notebooks: Notebook[];
	isLoading: boolean;
	error: string | null;
	creating: boolean;
	createNotebook: (name: string) => Promise<boolean>;
	refresh: () => Promise<void>;
}

/** Org-scoped notebooks for the current user, with inline create. */
export function useNotebooks(): UseNotebooksResult {
	const [notebooks, setNotebooks] = useState<Notebook[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);

	const load = useCallback(async () => {
		setError(null);
		try {
			const result = await apiClient.notes.listNotebooks.query();
			setNotebooks(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load notebooks");
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

	const createNotebook = useCallback(
		async (name: string) => {
			const trimmed = name.trim();
			if (trimmed.length === 0) return false;
			setCreating(true);
			try {
				await apiClient.notes.createNotebook.mutate({ name: trimmed });
				await load();
				return true;
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to create notebook",
				);
				return false;
			} finally {
				setCreating(false);
			}
		},
		[load],
	);

	return { notebooks, isLoading, error, creating, createNotebook, refresh };
}
