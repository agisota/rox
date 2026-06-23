"use client";

import { toast } from "@rox/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "@/trpc/react";

/**
 * Mutation bundle for the Drive browser (create/rename/move/delete folders +
 * files, and presigned download). Each successful write invalidates the current
 * folder listing (and quota, for deletes that reclaim bytes) so the cache-first
 * list refreshes. Centralised here to keep the component lean.
 */
export function useDriveActions(folderId: string | null) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const invalidateListing = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.drive.listFolder.queryKey({ folderId }),
		});
	}, [queryClient, trpc, folderId]);

	const invalidateQuota = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.drive.quota.queryKey(),
		});
	}, [queryClient, trpc]);

	const onError = (fallback: string) => (error: { message?: string }) => {
		toast.error(error.message || fallback);
	};

	const createFolder = useMutation(
		trpc.drive.createFolder.mutationOptions({
			onSuccess: invalidateListing,
			onError: onError("Не удалось создать папку"),
		}),
	);

	const renameFolder = useMutation(
		trpc.drive.renameFolder.mutationOptions({
			onSuccess: invalidateListing,
			onError: onError("Не удалось переименовать папку"),
		}),
	);

	const deleteFolder = useMutation(
		trpc.drive.deleteFolder.mutationOptions({
			onSuccess: async () => {
				await invalidateListing();
				await invalidateQuota();
			},
			onError: onError("Не удалось удалить папку"),
		}),
	);

	const renameFile = useMutation(
		trpc.drive.renameFile.mutationOptions({
			onSuccess: invalidateListing,
			onError: onError("Не удалось переименовать файл"),
		}),
	);

	const moveFile = useMutation(
		trpc.drive.moveFile.mutationOptions({
			onSuccess: invalidateListing,
			onError: onError("Не удалось переместить файл"),
		}),
	);

	const deleteFile = useMutation(
		trpc.drive.deleteFile.mutationOptions({
			onSuccess: async () => {
				await invalidateListing();
				await invalidateQuota();
			},
			onError: onError("Не удалось удалить файл"),
		}),
	);

	const requestDownload = useMutation(
		trpc.drive.requestDownload.mutationOptions({
			onError: onError("Не удалось скачать файл"),
		}),
	);

	const download = useCallback(
		async (fileId: string) => {
			const result = await requestDownload.mutateAsync({ fileId });
			if (result?.url) {
				window.location.href = result.url;
			}
		},
		[requestDownload],
	);

	return {
		createFolder,
		renameFolder,
		deleteFolder,
		renameFile,
		moveFile,
		deleteFile,
		download,
	};
}
