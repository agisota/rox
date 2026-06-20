"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { sha256Hex } from "../../utils/sha256";
import { performUpload, putBytesViaFetch } from "./performUpload";

/** Per-file upload progress for the dropzone UI. */
export interface UploadItem {
	id: string;
	name: string;
	status: "uploading" | "done" | "error";
	dedup?: boolean;
	error?: string;
}

/**
 * React hook that drives the Drive presigned upload for one folder and exposes
 * per-file progress. Bytes go straight to R2 (the API only signs + confirms).
 * On completion it invalidates the folder listing + quota so the cache-first
 * UI refreshes.
 */
export function useDriveUpload(folderId: string | null) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [items, setItems] = useState<UploadItem[]>([]);

	const requestUpload = useMutation(trpc.drive.requestUpload.mutationOptions());
	const confirmUpload = useMutation(trpc.drive.confirmUpload.mutationOptions());

	const upsert = useCallback((item: UploadItem) => {
		setItems((prev) => {
			const next = prev.filter((existing) => existing.id !== item.id);
			return [...next, item];
		});
	}, []);

	const uploadFiles = useCallback(
		async (files: File[]) => {
			if (files.length === 0) return;

			await Promise.all(
				files.map(async (file) => {
					const id = `${file.name}:${file.size}:${crypto.randomUUID()}`;
					upsert({ id, name: file.name, status: "uploading" });
					try {
						const outcome = await performUpload(file, folderId, {
							hash: sha256Hex,
							requestUpload: (input) => requestUpload.mutateAsync(input),
							putBytes: putBytesViaFetch,
							confirmUpload: (input) => confirmUpload.mutateAsync(input),
						});
						upsert({
							id,
							name: file.name,
							status: "done",
							dedup: outcome.dedup,
						});
					} catch (error) {
						upsert({
							id,
							name: file.name,
							status: "error",
							error: error instanceof Error ? error.message : "Upload failed",
						});
					}
				}),
			);

			await queryClient.invalidateQueries({
				queryKey: trpc.drive.listFolder.queryKey({ folderId }),
			});
			await queryClient.invalidateQueries({
				queryKey: trpc.drive.quota.queryKey(),
			});
		},
		[folderId, requestUpload, confirmUpload, queryClient, trpc, upsert],
	);

	const clearCompleted = useCallback(() => {
		setItems((prev) => prev.filter((item) => item.status === "uploading"));
	}, []);

	return {
		items,
		uploadFiles,
		clearCompleted,
		isUploading: items.some((item) => item.status === "uploading"),
	};
}
