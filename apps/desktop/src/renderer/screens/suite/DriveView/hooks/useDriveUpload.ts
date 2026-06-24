import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { performUpload, putBytesViaXhr } from "../utils/performUpload";
import { sha256Hex } from "../utils/sha256";

/** Per-file upload state for the tray UI. */
export interface UploadItem {
	id: string;
	name: string;
	status: "uploading" | "done" | "error";
	/** 0..1 — true byte progress from the XHR PUT. */
	progress: number;
	dedup?: boolean;
	error?: string;
	/** The original file + destination, retained so a failed item can retry. */
	file: File;
	folderId: string | null;
}

/**
 * Drives the Drive presigned upload for a destination folder and exposes
 * per-file progress for the {@link UploadTray}. Bytes go straight to R2 (the
 * API only signs + confirms). On settle it invalidates the folder listing +
 * quota so the cache-first UI refreshes.
 *
 * Ported from `apps/web/.../useDriveUpload` and upgraded with real XHR
 * progress (`putBytesViaXhr`) plus retry of failed items.
 */
export function useDriveUpload() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [items, setItems] = useState<UploadItem[]>([]);

	const requestUpload = useMutation(trpc.drive.requestUpload.mutationOptions());
	const confirmUpload = useMutation(trpc.drive.confirmUpload.mutationOptions());

	const patch = useCallback((id: string, next: Partial<UploadItem>) => {
		setItems((prev) =>
			prev.map((item) => (item.id === id ? { ...item, ...next } : item)),
		);
	}, []);

	const invalidate = useCallback(
		async (folderId: string | null) => {
			await queryClient.invalidateQueries({
				queryKey: trpc.drive.listFolder.queryKey({ folderId }),
			});
			await queryClient.invalidateQueries({
				queryKey: trpc.drive.quota.queryKey(),
			});
		},
		[queryClient, trpc],
	);

	const runOne = useCallback(
		async (item: UploadItem) => {
			patch(item.id, { status: "uploading", progress: 0, error: undefined });
			try {
				const outcome = await performUpload(item.file, item.folderId, {
					hash: sha256Hex,
					requestUpload: (input) => requestUpload.mutateAsync(input),
					putBytes: putBytesViaXhr,
					confirmUpload: (input) => confirmUpload.mutateAsync(input),
					onProgress: (fraction) =>
						patch(item.id, { progress: Math.min(1, fraction) }),
				});
				patch(item.id, {
					status: "done",
					progress: 1,
					dedup: outcome.dedup,
				});
			} catch (error) {
				patch(item.id, {
					status: "error",
					error: error instanceof Error ? error.message : "Сбой загрузки",
				});
			}
		},
		[confirmUpload, patch, requestUpload],
	);

	const uploadFiles = useCallback(
		async (files: File[], folderId: string | null) => {
			if (files.length === 0) return;

			const queued: UploadItem[] = files.map((file) => ({
				id: `${file.name}:${file.size}:${crypto.randomUUID()}`,
				name: file.name,
				status: "uploading",
				progress: 0,
				file,
				folderId,
			}));
			setItems((prev) => [...prev, ...queued]);

			await Promise.all(queued.map(runOne));
			await invalidate(folderId);
		},
		[invalidate, runOne],
	);

	const retry = useCallback(
		async (id: string) => {
			const item = items.find((entry) => entry.id === id);
			if (!item) return;
			await runOne(item);
			await invalidate(item.folderId);
		},
		[items, runOne, invalidate],
	);

	const dismiss = useCallback((id: string) => {
		setItems((prev) => prev.filter((item) => item.id !== id));
	}, []);

	const clearCompleted = useCallback(() => {
		setItems((prev) => prev.filter((item) => item.status === "uploading"));
	}, []);

	return {
		items,
		uploadFiles,
		retry,
		dismiss,
		clearCompleted,
		isUploading: items.some((item) => item.status === "uploading"),
		activeCount: items.filter((item) => item.status === "uploading").length,
	};
}
