import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { hexToRgba, resolveBranchColorHex } from "renderer/lib/color";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

/**
 * Alpha applied to the branch color when tinting the branch-name chip in the
 * sidebar. Higher than the (removed) chat wash because it backs a small,
 * single-line label instead of a full pane, so it needs to read as a chip.
 */
const BRANCH_NAME_TINT_ALPHA = 0.16;

/**
 * Alpha for the hairline ring around the tinted branch-name chip. Gives the
 * chip a defined edge against `bg-muted` row hovers without looking like a
 * solid fill.
 */
const BRANCH_NAME_RING_ALPHA = 0.32;

export interface WorkspaceBranchDecoration {
	/** Translucent rgba background for the branch-name chip, or null. */
	tint: string | null;
	/** Translucent rgba ring color for the branch-name chip, or null. */
	ring: string | null;
	/** Per-branch free-text labels (deduped/non-empty by the writer). */
	labels: string[];
}

/**
 * Reads the per-branch sidebar decoration (accent `color` + free-text
 * `labels`) for a workspace and resolves the color into subtle translucent
 * rgba values used to tint the branch-name chip in the sidebar.
 *
 * Cache-first per AGENTS.md: `useLiveQuery` may return the persisted row in
 * `data` before the collection is `isReady`, so we read `data` directly and
 * never gate on readiness. No row / no color simply yields `null` tints, and
 * missing labels yield an empty array (the schema default).
 */
export function useWorkspaceBranchDecoration(
	workspaceId: string,
): WorkspaceBranchDecoration {
	const collections = useCollections();
	const { data: localWorkspaceRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.where(({ v2WorkspaceLocalState }) =>
					eq(v2WorkspaceLocalState.workspaceId, workspaceId),
				)
				.select(({ v2WorkspaceLocalState }) => ({
					color: v2WorkspaceLocalState.sidebarState.color,
					labels: v2WorkspaceLocalState.sidebarState.labels,
				})),
		[collections, workspaceId],
	);

	const row = localWorkspaceRows[0];
	const color = row?.color ?? null;
	const labels = row?.labels ?? [];

	return useMemo<WorkspaceBranchDecoration>(() => {
		const hex = resolveBranchColorHex(color);
		return {
			tint: hex ? hexToRgba(hex, BRANCH_NAME_TINT_ALPHA) : null,
			ring: hex ? hexToRgba(hex, BRANCH_NAME_RING_ALPHA) : null,
			labels,
		};
	}, [color, labels]);
}
