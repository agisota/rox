import type { FileTree } from "@pierre/trees";
import { workspaceTrpc } from "@rox/workspace-client";
import type { FsWatchEvent } from "@rox/workspace-fs/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { logger } from "renderer/lib/logger";
import {
	asDirectoryHandle,
	parentRel,
	stripTrailingSlash,
	toAbs,
	toRel,
} from "../../utils/treePath";

interface UseFilesTabBridgeOptions {
	model: FileTree;
	workspaceId: string;
	rootPath: string;
	/**
	 * Read the persisted expanded-directory set (relative paths, no trailing
	 * slash; "" excluded) at the moment of root-load. Called once per
	 * workspace/root change to drive depth-1 prefetch + re-expansion (F32).
	 */
	getPersistedExpandedDirs?: () => string[];
	/**
	 * Persist a directory's expansion transition (F32). Fired when a known dir
	 * flips expanded ↔ collapsed in Pierre, including programmatic re-expansion
	 * during root-load restore and `collapseAll`.
	 */
	onExpandedChange?: (relDir: string, expanded: boolean) => void;
}

export interface FilesTabBridge {
	/** Tree paths Pierre knows about. Files: bare path; directories: trailing slash. */
	knownPaths: Set<string>;
	/** Relative directory paths whose children we've fetched. "" = root. */
	loadedDirs: Set<string>;
	/** Placeholder paths created via "New File/Folder", awaiting rename commit. */
	pendingCreates: Map<string, "file" | "folder">;
	/** Lazy-load a directory's children into Pierre. Idempotent + dedup'd. */
	fetchDir(relDir: string): Promise<void>;
	/** Re-fetch every loaded directory and resetPaths so drift can't accumulate. */
	doRefresh(): Promise<void>;
	/**
	 * Rekey every descendant of `oldDir` to live under `newDir` in our
	 * bookkeeping. Call after a user-driven folder rename so subsequent
	 * fs:events / lookups don't target stale prefixes.
	 */
	rekeyDescendants(oldDir: string, newDir: string): void;
	/**
	 * Snapshot the current workspace version. Pair with `isCurrent(token)`
	 * around external awaits (e.g. tRPC mutations from FilesTab) so a
	 * workspace switch mid-flight can be detected and the post-await mutation
	 * skipped — same pattern fetchDir/doRefresh use internally.
	 */
	getVersion(): number;
	isCurrent(token: number): boolean;
	isRefreshing: boolean;
}

/**
 * Bridges Pierre's path-flat tree model to our lazy-loading useFileTree backend.
 *
 * Owns three pieces of mutable bookkeeping (mutated in place — never reassigned —
 * so consumers can hold references safely):
 *   - `knownPaths`: union of every path Pierre has been told about
 *   - `loadedDirs`: directories whose children we've already fetched
 *   - `pendingCreates`: placeholder paths from the inline "New" flow
 *
 * Drives four side-effects:
 *   - Initial load: fetch root on mount / workspace switch
 *   - Lazy expand: subscribe to `model` and fetch children of any directory
 *     that becomes expanded but isn't loaded yet
 *   - Live sync: apply fs:events (create / delete / rename / overflow) to the
 *     model + bookkeeping, falling back to a full refresh on overflow
 *   - Pending-create cleanup: when Pierre's renaming flow is canceled with
 *     `removeIfCanceled`, it fires a `remove` mutation; we use that to drop
 *     the placeholder from our bookkeeping
 *
 * Workspace-switch races: every async listing captures a `versionRef` snapshot
 * and aborts its mutations if `versionRef` advanced (i.e. workspace/root
 * changed) before the await resolved.
 */
export function useFilesTabBridge({
	model,
	workspaceId,
	rootPath,
	getPersistedExpandedDirs,
	onExpandedChange,
}: UseFilesTabBridgeOptions): FilesTabBridge {
	const utils = workspaceTrpc.useUtils();
	const [isRefreshing, setIsRefreshing] = useState(false);

	// Route the persistence callbacks through refs so the model.subscribe /
	// root-load effects keep stable identities (and don't re-subscribe) while
	// always reaching the latest closures — same ref pattern FilesTab uses for
	// Pierre's handlers.
	const getPersistedExpandedDirsRef = useRef(getPersistedExpandedDirs);
	getPersistedExpandedDirsRef.current = getPersistedExpandedDirs;
	const onExpandedChangeRef = useRef(onExpandedChange);
	onExpandedChangeRef.current = onExpandedChange;

	// Last-known expansion state per directory, so the subscribe loop can detect
	// expand↔collapse transitions and persist only the edges (not every notify).
	const expansionStateRef = useRef(new Map<string, boolean>());

	// Sets/Maps are mutated in place (clear() on reset, never reassigned) so
	// consumers can read `bridge.knownPaths` once and trust the reference
	// across renders.
	const knownPathsRef = useRef(new Set<string>());
	const loadedDirsRef = useRef(new Set<string>());
	// Track in-flight loads as promises (not a Set) so concurrent callers
	// await the same fetch instead of short-circuiting. Pierre's `expand()`
	// notifies subscribers synchronously, and our model.subscribe hook fires
	// fetchDir before reveal's own `await fetchDir` runs — without shared
	// promises, reveal would resolve before children land in knownPaths.
	const inflightDirsRef = useRef(new Map<string, Promise<void>>());
	const pendingCreatesRef = useRef(new Map<string, "file" | "folder">());

	// Bumped on workspace/root change so async listings started against an
	// old workspace can detect they're stale and bail out before mutating.
	const versionRef = useRef(0);

	const fetchDir = useCallback(
		async (relDir: string): Promise<void> => {
			if (!rootPath || !workspaceId) return;
			if (loadedDirsRef.current.has(relDir)) return;
			const existing = inflightDirsRef.current.get(relDir);
			if (existing) return existing;

			const startVersion = versionRef.current;
			const promise = (async () => {
				try {
					const result = await utils.filesystem.listDirectory.fetch({
						workspaceId,
						absolutePath: toAbs(rootPath, relDir),
					});
					if (versionRef.current !== startVersion) return;
					const ops: { type: "add"; path: string }[] = [];
					for (const entry of result.entries) {
						const rel = toRel(rootPath, entry.absolutePath);
						const treePath = entry.kind === "directory" ? `${rel}/` : rel;
						if (knownPathsRef.current.has(treePath)) continue;
						knownPathsRef.current.add(treePath);
						ops.push({ type: "add", path: treePath });
					}
					if (ops.length > 0) model.batch(ops);
					loadedDirsRef.current.add(relDir);
				} catch (error) {
					if (versionRef.current !== startVersion) return;
					logger.error("[v2 FilesTab] listDirectory failed", {
						relDir,
						error,
					});
				}
			})();
			inflightDirsRef.current.set(relDir, promise);
			// Identity-check before deleting: on a workspace switch the map is
			// cleared and a new promise can be registered under the same key.
			// Without this guard, a late-resolving stale promise would evict
			// the live one and reopen duplicate fetches.
			void promise.finally(() => {
				if (inflightDirsRef.current.get(relDir) === promise) {
					inflightDirsRef.current.delete(relDir);
				}
			});
			return promise;
		},
		[model, rootPath, workspaceId, utils.filesystem.listDirectory],
	);

	const doRefresh = useCallback(async (): Promise<void> => {
		if (!rootPath || !workspaceId) return;
		setIsRefreshing(true);
		const startVersion = versionRef.current;
		try {
			const dirsToReload = Array.from(loadedDirsRef.current).sort(
				(a, b) => a.split("/").length - b.split("/").length,
			);
			loadedDirsRef.current.clear();

			// Collect fresh listings into a flat set then resetPaths so what
			// Pierre shows can't drift from what we think we know.
			const freshPaths = new Set<string>();
			for (const dir of dirsToReload) {
				try {
					const result = await utils.filesystem.listDirectory.fetch(
						{ workspaceId, absolutePath: toAbs(rootPath, dir) },
						{ staleTime: 0 },
					);
					if (versionRef.current !== startVersion) return;
					for (const entry of result.entries) {
						const rel = toRel(rootPath, entry.absolutePath);
						freshPaths.add(entry.kind === "directory" ? `${rel}/` : rel);
					}
					loadedDirsRef.current.add(dir);
				} catch (error) {
					logger.error("[v2 FilesTab] refresh listDirectory failed", {
						dir,
						error,
					});
				}
			}
			if (versionRef.current !== startVersion) return;
			knownPathsRef.current.clear();
			for (const path of freshPaths) knownPathsRef.current.add(path);
			model.resetPaths(Array.from(freshPaths));
		} finally {
			setIsRefreshing(false);
		}
	}, [model, rootPath, workspaceId, utils.filesystem.listDirectory]);

	// Restore the persisted expanded-directory set (F32): fetch root, then for
	// every persisted dir, fetch its parent (so the row exists), expand it, and
	// fetch its own children. Ancestors are restored before descendants (sorted
	// by depth) so each expand target is already present. Parallelized within a
	// depth tier; tiers run in order. Aborts if the workspace switched mid-flight.
	const restoreExpandedDirs = useCallback(async (): Promise<void> => {
		const persisted = getPersistedExpandedDirsRef.current?.();
		if (!persisted || persisted.length === 0) return;
		const startVersion = versionRef.current;

		// Group by depth so a parent dir is always restored before its children.
		const byDepth = new Map<number, string[]>();
		for (const dir of persisted) {
			if (!dir) continue;
			const depth = dir.split("/").length;
			const tier = byDepth.get(depth);
			if (tier) tier.push(dir);
			else byDepth.set(depth, [dir]);
		}
		const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);

		for (const depth of depths) {
			if (versionRef.current !== startVersion) return;
			await Promise.all(
				(byDepth.get(depth) ?? []).map(async (dir) => {
					// Parent must be loaded so this dir's row exists in Pierre.
					await fetchDir(parentRel(dir));
					if (versionRef.current !== startVersion) return;
					const dirKey = `${dir}/`;
					if (!knownPathsRef.current.has(dirKey)) return; // gone on disk
					const handle = asDirectoryHandle(model.getItem(dirKey));
					if (handle && !handle.isExpanded()) handle.expand();
					// Seed expansion bookkeeping so the subscribe loop doesn't
					// re-persist this as a fresh expand edge.
					expansionStateRef.current.set(dir, true);
					await fetchDir(dir);
				}),
			);
		}
	}, [model, fetchDir]);

	// Reset + initial load on workspace switch. Bumping versionRef invalidates
	// any in-flight fetches from the previous workspace.
	useEffect(() => {
		if (!rootPath || !workspaceId) return;
		versionRef.current += 1;
		knownPathsRef.current.clear();
		loadedDirsRef.current.clear();
		inflightDirsRef.current.clear();
		pendingCreatesRef.current.clear();
		expansionStateRef.current.clear();
		model.resetPaths([]);
		void fetchDir("").then(() => restoreExpandedDirs());
	}, [model, rootPath, workspaceId, fetchDir, restoreExpandedDirs]);

	// On every model change, scan known directories and lazy-load any newly
	// expanded ones. Pierre doesn't surface an explicit "expand" event, so we
	// detect by polling expansion state through getItem on each notify.
	useEffect(() => {
		return model.subscribe(() => {
			for (const path of knownPathsRef.current) {
				if (!path.endsWith("/")) continue;
				const dirRel = stripTrailingSlash(path);
				const handle = asDirectoryHandle(model.getItem(path));
				const expanded = handle?.isExpanded() ?? false;

				// Lazy-load children of any directory that became expanded but
				// isn't loaded yet.
				if (expanded && !loadedDirsRef.current.has(dirRel)) {
					void fetchDir(dirRel);
				}

				// Persist expand↔collapse edges (F32). Only fire on a real
				// transition so a stable expanded subtree doesn't re-write the
				// store on every notify. Skip root ("") — it's implicitly open.
				if (!dirRel) continue;
				const prev = expansionStateRef.current.get(dirRel);
				if (prev !== expanded) {
					expansionStateRef.current.set(dirRel, expanded);
					if (prev !== undefined || expanded) {
						onExpandedChangeRef.current?.(dirRel, expanded);
					}
				}
			}
		});
	}, [model, fetchDir]);

	// Pierre fires a `remove` mutation when an inline rename is canceled with
	// `removeIfCanceled: true`. Mirror that into our bookkeeping so the
	// placeholder doesn't ghost in pendingCreates / knownPaths. (Renames that
	// commit fire `move`, not `remove` — those are handled in handleRename.)
	useEffect(() => {
		return model.onMutation("remove", (event) => {
			pendingCreatesRef.current.delete(event.path);
			knownPathsRef.current.delete(event.path);
			if (event.path.endsWith("/")) {
				const dir = stripTrailingSlash(event.path);
				loadedDirsRef.current.delete(dir);
				purgeDescendants(knownPathsRef.current, loadedDirsRef.current, dir);
			}
		});
	}, [model]);

	useWorkspaceEvent(
		"fs:events",
		workspaceId,
		(event: FsWatchEvent) => {
			if (!rootPath) return;
			if (event.kind === "overflow") {
				void doRefresh();
				return;
			}

			const rel = toRel(rootPath, event.absolutePath);
			if (rel === event.absolutePath && event.absolutePath !== rootPath) {
				return; // outside workspace
			}

			if (event.kind === "rename" && event.oldAbsolutePath) {
				const oldRel = toRel(rootPath, event.oldAbsolutePath);
				const oldKey = matchKnown(knownPathsRef.current, oldRel);
				const isFolder = event.isDirectory ?? oldKey?.endsWith("/") ?? false;
				const newKey = isFolder ? `${rel}/` : rel;
				if (oldKey && knownPathsRef.current.has(oldKey)) {
					try {
						model.move(oldKey, newKey);
						knownPathsRef.current.delete(oldKey);
						knownPathsRef.current.add(newKey);
						if (isFolder) {
							const oldDir = stripTrailingSlash(oldKey);
							const newDir = stripTrailingSlash(newKey);
							rekeyDescendants(
								knownPathsRef.current,
								loadedDirsRef.current,
								oldDir,
								newDir,
							);
						}
					} catch {
						// Pierre rejected the move — fall back to remove + add.
						removeKnownPath(model, knownPathsRef.current, oldKey);
						if (isFolder) {
							purgeDescendants(
								knownPathsRef.current,
								loadedDirsRef.current,
								stripTrailingSlash(oldKey),
							);
						}
						addKnownPath(model, knownPathsRef.current, newKey);
					}
				} else {
					addKnownPath(model, knownPathsRef.current, newKey);
				}
				return;
			}

			if (event.kind === "delete") {
				const isFolder = event.isDirectory ?? false;
				const key = isFolder ? `${rel}/` : rel;
				const matched = matchKnown(knownPathsRef.current, rel) ?? key;
				removeKnownPath(model, knownPathsRef.current, matched);
				if (isFolder) {
					purgeDescendants(
						knownPathsRef.current,
						loadedDirsRef.current,
						stripTrailingSlash(matched),
					);
				}
				return;
			}

			if (event.kind === "create") {
				const isFolder = event.isDirectory ?? false;
				const key = isFolder ? `${rel}/` : rel;
				addKnownPath(model, knownPathsRef.current, key);
				return;
			}

			// "update" doesn't change tree shape.
		},
		Boolean(workspaceId && rootPath),
	);

	const rekeyDescendantsBound = useCallback(
		(oldDir: string, newDir: string) => {
			rekeyDescendants(
				knownPathsRef.current,
				loadedDirsRef.current,
				oldDir,
				newDir,
			);
		},
		[],
	);

	const getVersion = useCallback(() => versionRef.current, []);
	const isCurrent = useCallback(
		(token: number) => versionRef.current === token,
		[],
	);

	return {
		knownPaths: knownPathsRef.current,
		loadedDirs: loadedDirsRef.current,
		pendingCreates: pendingCreatesRef.current,
		fetchDir,
		doRefresh,
		rekeyDescendants: rekeyDescendantsBound,
		getVersion,
		isCurrent,
		isRefreshing,
	};
}

function matchKnown(known: Set<string>, rel: string): string | undefined {
	if (known.has(rel)) return rel;
	const dirKey = `${rel}/`;
	if (known.has(dirKey)) return dirKey;
	return undefined;
}

function addKnownPath(
	model: { add: (p: string) => void },
	known: Set<string>,
	path: string,
): void {
	if (known.has(path)) return;
	known.add(path);
	try {
		model.add(path);
	} catch {
		// Pierre may reject duplicates — ignore.
	}
}

function removeKnownPath(
	model: { remove: (p: string, options?: { recursive?: boolean }) => void },
	known: Set<string>,
	path: string,
): void {
	if (!known.has(path)) return;
	known.delete(path);
	try {
		model.remove(path, { recursive: true });
	} catch {
		// ignore
	}
}

// Walk knownPaths/loadedDirs and remove anything under `dirRel`. Used after a
// folder is removed (or renamed, paired with rekey) so stale descendants don't
// pin paths that no longer exist on disk.
function purgeDescendants(
	known: Set<string>,
	loaded: Set<string>,
	dirRel: string,
): void {
	const prefix = `${dirRel}/`;
	for (const path of known) {
		if (path.startsWith(prefix)) known.delete(path);
	}
	for (const dir of loaded) {
		if (dir === dirRel || dir.startsWith(prefix)) loaded.delete(dir);
	}
}

// Walk knownPaths/loadedDirs and re-key any descendants of `oldDir` to live
// under `newDir`. Pierre's `model.move(oldKey, newKey)` already moves the
// renamed subtree on its side, but our bookkeeping is path-keyed — without
// this, fs reconciliation looks up old paths and skips real changes.
function rekeyDescendants(
	known: Set<string>,
	loaded: Set<string>,
	oldDir: string,
	newDir: string,
): void {
	const oldPrefix = `${oldDir}/`;
	const movedKnown: string[] = [];
	for (const path of known) {
		if (path.startsWith(oldPrefix)) movedKnown.push(path);
	}
	for (const path of movedKnown) {
		known.delete(path);
		known.add(newDir + path.slice(oldDir.length));
	}
	const movedLoaded: string[] = [];
	for (const dir of loaded) {
		if (dir === oldDir || dir.startsWith(oldPrefix)) movedLoaded.push(dir);
	}
	for (const dir of movedLoaded) {
		loaded.delete(dir);
		loaded.add(newDir + dir.slice(oldDir.length));
	}
}
