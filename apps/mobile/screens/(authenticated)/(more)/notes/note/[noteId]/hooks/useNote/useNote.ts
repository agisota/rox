import type { RouterOutputs } from "@rox/trpc";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/trpc/client";

export type NoteDetail = RouterOutputs["notes"]["getNote"];

interface UseNoteResult {
	note: NoteDetail | null;
	isLoading: boolean;
	error: string | null;
}

/** Read a single note (title + markdown body) for the read view. */
export function useNote(noteId: string | undefined): UseNoteResult {
	const [note, setNote] = useState<NoteDetail | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!noteId) {
			setIsLoading(false);
			return;
		}
		setError(null);
		try {
			const result = await apiClient.notes.getNote.query({ noteId });
			setNote(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load note");
		} finally {
			setIsLoading(false);
		}
	}, [noteId]);

	useEffect(() => {
		setIsLoading(true);
		void load();
	}, [load]);

	return { note, isLoading, error };
}
