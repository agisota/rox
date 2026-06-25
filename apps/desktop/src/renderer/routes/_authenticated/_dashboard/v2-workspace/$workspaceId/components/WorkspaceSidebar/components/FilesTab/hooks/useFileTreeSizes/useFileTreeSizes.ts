import type { FileTree } from "@pierre/trees";
import { workspaceTrpc } from "@rox/workspace-client";
import { useCallback, useEffect, useRef } from "react";
import { logger } from "renderer/lib/logger";
import { toAbs } from "../../utils/treePath";

interface UseFileTreeSizesOptions {
	model: FileTree;
	/** Pierre tree paths the bridge knows about (files: bare; dirs: trailing slash). */
	knownPaths: Set<string>;
	workspaceId: string;
	rootPath: string;
	/**
	 * Called after a batch of sizes resolves. The caller repaints the tree here
	 * (Pierre captures `renderRowDecoration` once, so it only re-runs on a model
	 * render). Must be stable across renders.
	 */
	onSizesLoaded: () => void;
}

export interface FileTreeSizes {
	/** Byte size for a file row by its Pierre tree path, or `undefined` if not loaded yet. */
	getSize(treePath: string): number | undefined;
}

/**
 * Lazily resolves per-file byte sizes for the Files-tab tree and exposes them
 * for the row decoration (F31). `listDirectory` carries no size, so each file's
 * `getMetadata` is fetched once and cached; directories are skipped (folders
 * show no size).
 *
 * Mirrors `useFallthroughIcons`'s async-metadata pattern: the tree renders
 * first, sizes fill in afterwards, then `onSizesLoaded` triggers a repaint.
 *
 * Workspace switches reset the cache (keyed on `workspaceId`/`rootPath`); stale
 * in-flight fetches are dropped via an epoch snapshot, matching
 * `useFilesTabBridge`.
 */
export function useFileTreeSizes({
	model,
	knownPaths,
	workspaceId,
	rootPath,
	onSizesLoaded,
}: UseFileTreeSizesOptions): FileTreeSizes {
	const utils = workspaceTrpc.useUtils();

	// Mutated in place (never reassigned) so the returned `getSize` reads a live
	// reference across renders.
	const sizeByPathRef = useRef(new Map<string, number>());
	// Paths we've already requested (resolved or in-flight) so each file is
	// fetched at most once per workspace.
	const requestedRef = useRef(new Set<string>());
	// Bumped on workspace/root change so late fetches from a previous workspace
	// detect they're stale and skip caching.
	const epochRef = useRef(0);
	// Last workspace/root the cache was populated for; a change resets it.
	const cacheKeyRef = useRef<string | null>(null);

	// On every model change, fetch sizes for any newly-known file rows. Pierre
	// has no explicit "rows added" event, so we scan `knownPaths` on each notify
	// (same approach as the bridge's lazy-expand effect). A workspace/root switch
	// resets the cache before fetching so stale sizes can't leak across trees.
	useEffect(() => {
		if (!rootPath || !workspaceId) return;

		const cacheKey = `${workspaceId}${rootPath}`;
		if (cacheKeyRef.current !== cacheKey) {
			cacheKeyRef.current = cacheKey;
			epochRef.current += 1;
			sizeByPathRef.current.clear();
			requestedRef.current.clear();
		}

		const fetchMissing = () => {
			const startEpoch = epochRef.current;
			const toFetch: string[] = [];
			for (const path of knownPaths) {
				if (path.endsWith("/")) continue; // directory — no size
				if (requestedRef.current.has(path)) continue;
				requestedRef.current.add(path);
				toFetch.push(path);
			}
			if (toFetch.length === 0) return;

			void Promise.all(
				toFetch.map(async (path) => {
					try {
						const metadata = await utils.filesystem.getMetadata.fetch({
							workspaceId,
							absolutePath: toAbs(rootPath, path),
						});
						if (epochRef.current !== startEpoch) return false;
						if (metadata?.size != null) {
							sizeByPathRef.current.set(path, metadata.size);
							return true;
						}
					} catch (error) {
						// Allow a later notify to retry this path.
						requestedRef.current.delete(path);
						logger.error("[v2 FilesTab] getMetadata failed", { path, error });
					}
					return false;
				}),
			).then((results) => {
				if (epochRef.current !== startEpoch) return;
				if (results.some(Boolean)) onSizesLoaded();
			});
		};

		fetchMissing();
		return model.subscribe(fetchMissing);
	}, [
		model,
		knownPaths,
		workspaceId,
		rootPath,
		utils.filesystem.getMetadata,
		onSizesLoaded,
	]);

	const getSize = useCallback(
		(treePath: string) => sizeByPathRef.current.get(treePath),
		[],
	);

	return { getSize };
}
