import type { RouterOutputs } from "@rox/trpc";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/trpc/client";

export type Note = RouterOutputs["notes"]["listNotes"][number];

interface UseNotesResult {
	notes: Note[];
	isLoading: boolean;
	error: string | null;
	creating: boolean;
	createNote: (title: string) => Promise<string | null>;
	refresh: () => Promise<void>;
}

/** Notes inside a notebook, with inline create that returns the new note id. */
export function useNotes(notebookId: string | undefined): UseNotesResult {
	const [notes, setNotes] = useState<Note[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);

	const load = useCallback(async () => {
		if (!notebookId) {
			setIsLoading(false);
			return;
		}
		setError(null);
		try {
			const result = await apiClient.notes.listNotes.query({ notebookId });
			setNotes(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load notes");
		} finally {
			setIsLoading(false);
		}
	}, [notebookId]);

	useEffect(() => {
		setIsLoading(true);
		void load();
	}, [load]);

	const refresh = useCallback(async () => {
		await load();
	}, [load]);

	const createNote = useCallback(
		async (title: string) => {
			if (!notebookId) return null;
			const trimmed = title.trim();
			if (trimmed.length === 0) return null;
			setCreating(true);
			try {
				const created = await apiClient.notes.createNote.mutate({
					notebookId,
					title: trimmed,
				});
				await load();
				return created?.id ?? null;
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to create note");
				return null;
			} finally {
				setCreating(false);
			}
		},
		[notebookId, load],
	);

	return { notes, isLoading, error, creating, createNote, refresh };
}
