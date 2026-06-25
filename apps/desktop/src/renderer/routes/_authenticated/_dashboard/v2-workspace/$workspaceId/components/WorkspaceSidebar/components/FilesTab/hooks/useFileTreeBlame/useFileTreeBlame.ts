import type { FileTree } from "@pierre/trees";
import type { AppRouter } from "@rox/host-service";
import { workspaceTrpc } from "@rox/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useEffect, useRef } from "react";
import { logger } from "renderer/lib/logger";

/** Last-author blame payload from `git.getBlame`, non-null. */
export type BlameAuthor = NonNullable<
	inferRouterOutputs<AppRouter>["git"]["getBlame"]["blame"]
>;

interface UseFileTreeBlameOptions {
	model: FileTree;
	/** Pierre tree paths the bridge knows about (files: bare; dirs: trailing slash). */
	knownPaths: Set<string>;
	workspaceId: string;
	rootPath: string;
	/**
	 * When false the hook is inert — no `git.getBlame` calls, cache cleared. Blame
	 * is shared-workspace-only (F35): in solo it would be pure self-noise, so the
	 * Files tab gates it the same way the byline (F38) and presence surfaces do.
	 */
	enabled: boolean;
	/**
	 * Called after a batch of blame results resolves so the caller can repaint the
	 * tree (Pierre captures `renderRowDecoration` once and only re-runs it on a
	 * model render). Must be stable across renders.
	 */
	onBlameLoaded: () => void;
}

export interface FileTreeBlame {
	/** Last-author blame for a file row by its Pierre tree path, or `undefined` if not loaded / not applicable. */
	getBlame(treePath: string): BlameAuthor | undefined;
}

/**
 * Lazily resolves per-file last-author blame for the Files-tab tree and exposes
 * it for the row decoration (F35). Each visible file's `git.getBlame` is fetched
 * once and cached; directories are skipped (folders carry no single author).
 *
 * Mirrors {@link useFileTreeSizes}: the tree renders first, blame fills in
 * afterwards, then `onBlameLoaded` triggers a repaint — so resolving blame never
 * blocks the tree render. Workspace switches (and toggling `enabled` off) reset
 * the cache; stale in-flight fetches are dropped via an epoch snapshot.
 */
export function useFileTreeBlame({
	model,
	knownPaths,
	workspaceId,
	rootPath,
	enabled,
	onBlameLoaded,
}: UseFileTreeBlameOptions): FileTreeBlame {
	const utils = workspaceTrpc.useUtils();

	// Mutated in place (never reassigned) so the returned `getBlame` reads a live
	// reference across renders.
	const blameByPathRef = useRef(new Map<string, BlameAuthor>());
	// Paths we've already requested (resolved or in-flight) so each file is
	// fetched at most once per workspace.
	const requestedRef = useRef(new Set<string>());
	// Bumped on workspace/root change (or disable) so late fetches detect they're
	// stale and skip caching.
	const epochRef = useRef(0);
	// Last cache key the cache was populated for; a change resets it.
	const cacheKeyRef = useRef<string | null>(null);

	useEffect(() => {
		// When disabled, drop any cached blame so re-enabling refetches fresh and
		// a stale workspace can't leak its authors into a solo view.
		if (!enabled) {
			epochRef.current += 1;
			blameByPathRef.current.clear();
			requestedRef.current.clear();
			cacheKeyRef.current = null;
			return;
		}
		if (!rootPath || !workspaceId) return;

		const cacheKey = `${workspaceId}${rootPath}`;
		if (cacheKeyRef.current !== cacheKey) {
			cacheKeyRef.current = cacheKey;
			epochRef.current += 1;
			blameByPathRef.current.clear();
			requestedRef.current.clear();
		}

		const fetchMissing = () => {
			const startEpoch = epochRef.current;
			const toFetch: string[] = [];
			for (const path of knownPaths) {
				if (path.endsWith("/")) continue; // directory — no single author
				if (requestedRef.current.has(path)) continue;
				requestedRef.current.add(path);
				toFetch.push(path);
			}
			if (toFetch.length === 0) return;

			void Promise.all(
				toFetch.map(async (path) => {
					try {
						const { blame } = await utils.git.getBlame.fetch({
							workspaceId,
							path,
						});
						if (epochRef.current !== startEpoch) return false;
						if (blame) {
							blameByPathRef.current.set(path, blame);
							return true;
						}
					} catch (error) {
						// Allow a later notify to retry this path.
						requestedRef.current.delete(path);
						logger.error("[v2 FilesTab] getBlame failed", { path, error });
					}
					return false;
				}),
			).then((results) => {
				if (epochRef.current !== startEpoch) return;
				if (results.some(Boolean)) onBlameLoaded();
			});
		};

		fetchMissing();
		return model.subscribe(fetchMissing);
	}, [
		model,
		knownPaths,
		workspaceId,
		rootPath,
		enabled,
		utils.git.getBlame,
		onBlameLoaded,
	]);

	const getBlame = useCallback(
		(treePath: string) => blameByPathRef.current.get(treePath),
		[],
	);

	return { getBlame };
}
