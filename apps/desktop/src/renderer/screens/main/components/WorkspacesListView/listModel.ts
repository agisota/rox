import Fuse from "fuse.js";
import type { ProjectGroup, WorkspaceItem } from "./types";

/**
 * Flattened virtualizer row. The list body is a single windowed column over a
 * mixed `[project-header | workspace-row]` stream so {@link
 * https://tanstack.com/virtual `useVirtualizer`} can window the whole surface
 * — sticky project headers ride on top of the same scroll element.
 *
 * Pure data shaping (no React) so web/mobile twins can reuse it verbatim.
 */
export type FlatRow =
	| {
			kind: "header";
			key: string;
			projectId: string;
			projectName: string;
			count: number;
	  }
	| { kind: "row"; key: string; item: WorkspaceItem };

/** Flattens grouped projects into the windowed `[header, ...rows]` stream. */
export function flattenProjectGroups(groups: ProjectGroup[]): FlatRow[] {
	const rows: FlatRow[] = [];
	for (const group of groups) {
		rows.push({
			kind: "header",
			key: `header-${group.projectId}`,
			projectId: group.projectId,
			projectName: group.projectName,
			count: group.workspaces.length,
		});
		for (const item of group.workspaces) {
			rows.push({ kind: "row", key: item.uniqueId, item });
		}
	}
	return rows;
}

/**
 * Builds a fuzzy index over workspace name / project / branch. Shared by the
 * list filter and the cmd+K palette so both rank results identically.
 */
export function buildWorkspaceFuse(
	items: WorkspaceItem[],
): Fuse<WorkspaceItem> {
	return new Fuse(items, {
		keys: [
			{ name: "name", weight: 0.6 },
			{ name: "projectName", weight: 0.25 },
			{ name: "branch", weight: 0.15 },
		],
		threshold: 0.4,
		ignoreLocation: true,
		includeScore: true,
	});
}

/**
 * Fuzzy-filters `items` by `query`. Empty/whitespace query returns the input
 * order untouched (the caller already sorts groups by recency).
 */
export function fuzzyFilter(
	fuse: Fuse<WorkspaceItem>,
	items: WorkspaceItem[],
	query: string,
): WorkspaceItem[] {
	const trimmed = query.trim();
	if (!trimmed) return items;
	return fuse.search(trimmed).map((result) => result.item);
}
