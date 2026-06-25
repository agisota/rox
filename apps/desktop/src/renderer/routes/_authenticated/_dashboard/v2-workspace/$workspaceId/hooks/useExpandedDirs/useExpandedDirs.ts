import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo, useRef } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export interface ExpandedDirsApi {
	/**
	 * Relative directory paths (no trailing slash; "" = root is implicit and
	 * never stored) currently persisted as expanded. Stable across renders while
	 * the underlying value is unchanged.
	 */
	expandedDirs: string[];
	/** Read the latest persisted snapshot without subscribing — used once on root-load to drive prefetch. */
	getSnapshot: () => string[];
	/** Persist a directory's expansion state. Idempotent; "" (root) is ignored. */
	setExpanded: (relDir: string, next: boolean) => void;
}

/**
 * Persists the Files-tree expanded-directory set (F32) into the workspace's
 * local-state row, mirroring `useViewedFiles`. The bridge owns Pierre's
 * expansion bookkeeping; this hook is the persistence edge — it records each
 * expand/collapse and exposes the stored set so the bridge can re-expand +
 * prefetch on root-load.
 */
export function useExpandedDirs(workspaceId: string): ExpandedDirsApi {
	const collections = useCollections();
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.v2WorkspaceLocalState })
				.where(({ state }) => eq(state.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	// Depend on the raw (live-query-stable) value, not a fresh `?? []` literal —
	// otherwise `expandedDirs` rebuilds every render whenever no dirs are open.
	const stored = rows[0]?.expandedDirs;
	const expandedDirs = useMemo(() => stored ?? [], [stored]);

	// Keep the latest value in a ref so `getSnapshot` (called from the bridge's
	// root-load effect, which must not re-run when this array changes) reads the
	// freshest persisted set without taking it as a dependency.
	const expandedDirsRef = useRef(expandedDirs);
	expandedDirsRef.current = expandedDirs;
	const getSnapshot = useCallback(() => expandedDirsRef.current, []);

	const setExpanded = useCallback(
		(relDir: string, next: boolean) => {
			if (!relDir) return; // root is always implicitly expanded
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				const current = draft.expandedDirs ?? [];
				const has = current.includes(relDir);
				if (next && !has) {
					draft.expandedDirs = [...current, relDir];
				} else if (!next && has) {
					draft.expandedDirs = current.filter((p) => p !== relDir);
				}
			});
		},
		[collections, workspaceId],
	);

	return { expandedDirs, getSnapshot, setExpanded };
}
