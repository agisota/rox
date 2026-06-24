import { toast } from "@rox/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";

/**
 * Mutation bundle for the desktop Drive browser (create / rename / move /
 * delete folders + files, and presigned download). Ported from
 * `apps/web/.../DriveBrowser/useDriveActions.ts` onto the desktop cloud tRPC
 * proxy. Each successful write invalidates the current folder listing (and
 * quota, for deletes that reclaim bytes) so the cache-first list refreshes.
 *
 * Rename/move are wired with optimistic-friendly invalidation; the desktop
 * surface drives inline rename + AlertDialog delete on top of these (replacing
 * the web app's window.prompt / window.confirm).
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
		logger.error(`[DriveView] ${fallback}`, error);
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

	const moveFolder = useMutation(
		trpc.drive.moveFolder.mutationOptions({
			onSuccess: invalidateListing,
			onError: onError("Не удалось переместить папку"),
		}),
	);

	const deleteFolder = useMutation(
		trpc.drive.deleteFolder.mutationOptions({
			onSuccess: async () => {
				await invalidateListing();
				await invalidateQuota();
				toast.success("Папка удалена");
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
			onSuccess: async (result) => {
				await invalidateListing();
				await invalidateQuota();
				// The router soft-trashes files still referenced by chat/email/canvas
				// attachments (bytes/quota free only when the last ref is gone).
				toast.success(
					result?.softTrashed ? "Перемещено в корзину" : "Файл удалён",
				);
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
				// Presigned GET straight from R2 — anchor-navigate to trigger the
				// browser download without proxying bytes through the app.
				const anchor = document.createElement("a");
				anchor.href = result.url;
				anchor.rel = "noreferrer";
				anchor.download = "";
				document.body.appendChild(anchor);
				anchor.click();
				anchor.remove();
			}
		},
		[requestDownload],
	);

	/** Resolve a short-TTL presigned GET url for inline preview. */
	const getPreviewUrl = useCallback(
		async (fileId: string): Promise<string> => {
			const result = await requestDownload.mutateAsync({ fileId });
			if (!result?.url) throw new Error("Нет ссылки для предпросмотра");
			return result.url;
		},
		[requestDownload],
	);

	return {
		createFolder,
		renameFolder,
		moveFolder,
		deleteFolder,
		renameFile,
		moveFile,
		deleteFile,
		download,
		getPreviewUrl,
	};
}
