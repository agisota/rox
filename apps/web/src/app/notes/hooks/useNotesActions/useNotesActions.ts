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
			queryKey: trpc.notes.listNotebooks.queryKey(),
		});
	}, [queryClient, trpc]);

	const invalidateNotes = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.notes.listNotes.queryKey({
				notebookId: notebookId ?? undefined,
			}),
		});
	}, [queryClient, trpc, notebookId]);

	// `getNote` powers the editor (publish state + public URL); it lives outside
	// the list queries, so writes that change a single note must invalidate it by
	// id or the editor keeps a stale snapshot until an unrelated refetch.
	const invalidateNote = useCallback(
		async (noteId: string) => {
			await queryClient.invalidateQueries({
				queryKey: trpc.notes.getNote.queryKey({ noteId }),
			});
		},
		[queryClient, trpc],
	);

	const onError = (fallback: string) => (error: { message?: string }) => {
		toast.error(error.message || fallback);
	};

	const createNotebook = useMutation(
		trpc.notes.createNotebook.mutationOptions({
			onSuccess: invalidateNotebooks,
			onError: onError("Не удалось создать блокнот"),
		}),
	);

	const deleteNotebook = useMutation(
		trpc.notes.deleteNotebook.mutationOptions({
			onSuccess: async () => {
				await invalidateNotebooks();
				await invalidateNotes();
			},
			onError: onError("Не удалось удалить блокнот"),
		}),
	);

	const createNote = useMutation(
		trpc.notes.createNote.mutationOptions({
			onSuccess: invalidateNotes,
			onError: onError("Не удалось создать заметку"),
		}),
	);

	const updateNote = useMutation(
		trpc.notes.updateNote.mutationOptions({
			// `updateNote` returns the row WITHOUT `publicUrl`, so we refetch
			// `getNote` (and the lists) rather than seeding the cache with a row
			// that would blank the editor's public-link block.
			onSuccess: async (row) => {
				if (row?.id) await invalidateNote(row.id);
				await invalidateNotes();
			},
			onError: onError("Не удалось сохранить заметку"),
		}),
	);

	const deleteNote = useMutation(
		trpc.notes.deleteNote.mutationOptions({
			onSuccess: invalidateNotes,
			onError: onError("Не удалось удалить заметку"),
		}),
	);

	const setPublished = useMutation(
		trpc.notes.setPublished.mutationOptions({
			// The returned row carries the freshly-minted `publicUrl`, so we seed
			// the `getNote` cache directly (exact, no refetch flicker) before
			// refreshing the list so the published dot updates too.
			onSuccess: async (row) => {
				if (row?.id) {
					queryClient.setQueryData(
						trpc.notes.getNote.queryKey({ noteId: row.id }),
						row,
					);
				}
				await invalidateNotes();
			},
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
