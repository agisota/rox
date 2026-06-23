import type { RouterOutputs } from "@rox/trpc";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/trpc/client";

export type DriveListing = RouterOutputs["drive"]["listFolder"];
export type DriveFolder = DriveListing["folders"][number];
export type DriveFile = DriveListing["files"][number];

interface UseDriveFolderResult {
	listing: DriveListing | null;
	isLoading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

/**
 * Read a single Drive folder level (the root when `folderId` is null) via the
 * plain tRPC client. Drive has no Electric collection, so this mirrors the
 * mutation hooks' manual lifecycle: state for data/loading/error plus an
 * imperative refresh for pull-to-refresh.
 */
export function useDriveFolder(folderId: string | null): UseDriveFolderResult {
	const [listing, setListing] = useState<DriveListing | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setError(null);
		try {
			const result = await apiClient.drive.listFolder.query(
				folderId ? { folderId } : undefined,
			);
			setListing(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load folder");
		} finally {
			setIsLoading(false);
		}
	}, [folderId]);

	useEffect(() => {
		setIsLoading(true);
		void load();
	}, [load]);

	const refresh = useCallback(async () => {
		await load();
	}, [load]);

	return { listing, isLoading, error, refresh };
}
