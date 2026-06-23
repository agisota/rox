import { File, UploadType } from "expo-file-system";
import { useCallback, useReducer } from "react";
import { apiClient } from "@/lib/trpc/client";
import { sha256Hex } from "../../utils/sha256Hex";
import {
	INITIAL_UPLOAD_STATE,
	type UploadState,
	uploadReducer,
} from "../../utils/uploadState";

interface UseDriveUploadResult {
	state: UploadState;
	/**
	 * Open the system file picker and run the full presigned upload flow into the
	 * given folder (null = root). Resolves to `true` when a file was uploaded (or
	 * deduplicated), `false` when the user cancelled, and rejects only on a
	 * genuine failure (which is also reflected in `state.error`).
	 */
	pickAndUpload: (folderId: string | null) => Promise<boolean>;
	reset: () => void;
}

const DEFAULT_MEDIA_TYPE = "application/octet-stream";

/**
 * Drive binary upload through the existing presigned flow:
 *   pick → hash (sha256) → drive.requestUpload → PUT to signed URL →
 *   drive.confirmUpload.
 *
 * Dedup short-circuits the PUT: when `requestUpload` reports the content already
 * exists, we skip straight to done. Progress + phase live in the pure
 * {@link uploadReducer} so the UI banner stays deterministic.
 */
export function useDriveUpload(): UseDriveUploadResult {
	const [state, dispatch] = useReducer(uploadReducer, INITIAL_UPLOAD_STATE);

	const reset = useCallback(() => dispatch({ type: "reset" }), []);

	const pickAndUpload = useCallback(
		async (folderId: string | null): Promise<boolean> => {
			const picked = await File.pickFileAsync({ mimeTypes: ["*/*"] });
			if (picked.canceled) return false;

			const file = picked.result;
			const filename = file.name || "upload";
			dispatch({ type: "pick", filename });

			try {
				const buffer = await file.arrayBuffer();
				const sizeBytes = buffer.byteLength;
				const sha256 = await sha256Hex(buffer);
				const mediaType = file.type || DEFAULT_MEDIA_TYPE;

				dispatch({ type: "request" });
				const requested = await apiClient.drive.requestUpload.mutate({
					filename,
					mediaType,
					sizeBytes,
					sha256,
					folderId,
				});

				// Dedup: the content already exists for this user — nothing to PUT.
				if (requested.dedup || !requested.upload) {
					dispatch({ type: "done" });
					return true;
				}

				dispatch({ type: "upload" });
				const result = await file.upload(requested.upload.url, {
					httpMethod: "PUT",
					uploadType: UploadType.BINARY_CONTENT,
					headers: { "content-type": mediaType },
					onProgress: ({ bytesSent, totalBytes }) =>
						dispatch({ type: "progress", bytesSent, totalBytes }),
				});
				if (result.status < 200 || result.status >= 300) {
					throw new Error(`Upload failed with status ${result.status}`);
				}

				dispatch({ type: "confirm" });
				await apiClient.drive.confirmUpload.mutate({
					fileId: requested.fileId,
				});

				dispatch({ type: "done" });
				return true;
			} catch (err) {
				dispatch({
					type: "fail",
					error: err instanceof Error ? err.message : "Upload failed",
				});
				return false;
			}
		},
		[],
	);

	return { state, pickAndUpload, reset };
}
