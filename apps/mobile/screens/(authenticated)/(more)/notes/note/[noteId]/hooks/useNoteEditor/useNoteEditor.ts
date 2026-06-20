import type { RouterOutputs } from "@rox/trpc";
import { useCallback, useState } from "react";
import { apiClient } from "@/lib/trpc/client";

export type NoteDetail = RouterOutputs["notebooks"]["getNote"];

interface SaveInput {
	title: string;
	markdown: string;
	tags: string[];
}

interface UseNoteEditorResult {
	saving: boolean;
	publishing: boolean;
	error: string | null;
	/** Persist title/markdown/tags. Returns true on success. */
	save: (input: SaveInput) => Promise<boolean>;
	/** Toggle the public share. Returns the refreshed note (with publicUrl). */
	setPublished: (isPublished: boolean) => Promise<NoteDetail | null>;
}

/**
 * Write operations for a single note: `notebooks.updateNote` (title/markdown/
 * tags) and `notebooks.setPublished` (public_slug share). Plain tRPC mutations
 * mirroring the other Notes hooks; after toggling publish we re-read the note so
 * the screen can surface the server-assigned public URL immediately.
 */
export function useNoteEditor(noteId: string | undefined): UseNoteEditorResult {
	const [saving, setSaving] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const save = useCallback(
		async ({ title, markdown, tags }: SaveInput) => {
			if (!noteId) return false;
			const trimmed = title.trim();
			if (trimmed.length === 0) {
				setError("Title is required.");
				return false;
			}
			setSaving(true);
			setError(null);
			try {
				await apiClient.notebooks.updateNote.mutate({
					noteId,
					title: trimmed,
					markdown,
					tags,
				});
				return true;
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to save note");
				return false;
			} finally {
				setSaving(false);
			}
		},
		[noteId],
	);

	const setPublished = useCallback(
		async (isPublished: boolean) => {
			if (!noteId) return null;
			setPublishing(true);
			setError(null);
			try {
				await apiClient.notebooks.setPublished.mutate({
					noteId,
					isPublished,
				});
				// Re-read to pick up the server-assigned slug + publicUrl.
				return await apiClient.notebooks.getNote.query({ noteId });
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to update publish state",
				);
				return null;
			} finally {
				setPublishing(false);
			}
		},
		[noteId],
	);

	return { saving, publishing, error, save, setPublished };
}
