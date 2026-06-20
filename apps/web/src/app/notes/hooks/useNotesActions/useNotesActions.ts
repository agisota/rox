"use client";

import { toast } from "@rox/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "@/trpc/react";

/**
 * Mutation bundle for the Notes surface (notebook + note CRUD + publish toggle).
 * Each successful write invalidates the affected list query so the cache-first
 * UI refreshes. Centralised here to keep the components lean (mirrors the Drive
 * `useDriveActions` pattern).
 */
export function useNotesActions(notebookId: string | null) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const invalidateNotebooks = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.notebooks.listNotebooks.queryKey(),
		});
	}, [queryClient, trpc]);

	const invalidateNotes = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.notebooks.listNotes.queryKey({
				notebookId: notebookId ?? undefined,
			}),
		});
	}, [queryClient, trpc, notebookId]);

	const onError = (fallback: string) => (error: { message?: string }) => {
		toast.error(error.message || fallback);
	};

	const createNotebook = useMutation(
		trpc.notebooks.createNotebook.mutationOptions({
			onSuccess: invalidateNotebooks,
			onError: onError("Не удалось создать блокнот"),
		}),
	);

	const deleteNotebook = useMutation(
		trpc.notebooks.deleteNotebook.mutationOptions({
			onSuccess: async () => {
				await invalidateNotebooks();
				await invalidateNotes();
			},
			onError: onError("Не удалось удалить блокнот"),
		}),
	);

	const createNote = useMutation(
		trpc.notebooks.createNote.mutationOptions({
			onSuccess: invalidateNotes,
			onError: onError("Не удалось создать заметку"),
		}),
	);

	const updateNote = useMutation(
		trpc.notebooks.updateNote.mutationOptions({
			onSuccess: invalidateNotes,
			onError: onError("Не удалось сохранить заметку"),
		}),
	);

	const deleteNote = useMutation(
		trpc.notebooks.deleteNote.mutationOptions({
			onSuccess: invalidateNotes,
			onError: onError("Не удалось удалить заметку"),
		}),
	);

	const setPublished = useMutation(
		trpc.notebooks.setPublished.mutationOptions({
			onSuccess: invalidateNotes,
			onError: onError("Не удалось изменить публикацию"),
		}),
	);

	return {
		createNotebook,
		deleteNotebook,
		createNote,
		updateNote,
		deleteNote,
		setPublished,
	};
}
