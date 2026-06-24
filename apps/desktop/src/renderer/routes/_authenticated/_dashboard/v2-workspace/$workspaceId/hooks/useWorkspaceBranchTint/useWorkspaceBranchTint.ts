import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { hexToRgba, resolveBranchColorHex } from "renderer/lib/color";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

/**
 * Alpha applied to the branch color when tinting the chat background. Kept low
 * so the tint reads as a subtle wash over `bg-background`, not a fill.
 */
const BRANCH_TINT_ALPHA = 0.06;

/**
 * Resolves the per-branch accent color stored on the workspace's local state
 * (`sidebarState.color`) into a subtle translucent rgba tint for the chat
 * background. Returns `null` when no custom color is set.
 *
 * Cache-first per AGENTS.md: `useLiveQuery` may return the persisted row in
 * `data` before the collection is `isReady`, so we read `data` directly and
 * never gate on readiness. No row / no color simply yields `null` (default).
 */
export function useWorkspaceBranchTint(workspaceId: string): string | null {
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
				})),
		[collections, workspaceId],
	);

	const color = localWorkspaceRows[0]?.color ?? null;

	return useMemo(() => {
		const hex = resolveBranchColorHex(color);
		return hex ? hexToRgba(hex, BRANCH_TINT_ALPHA) : null;
	}, [color]);
}
