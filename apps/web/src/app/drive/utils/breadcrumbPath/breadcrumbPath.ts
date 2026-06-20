/**
 * Breadcrumb derivation for the Drive browser.
 *
 * The Drive router's `listFolder` returns only the *children* of a folder, not
 * its ancestor chain, so the UI tracks navigation as a stack of visited folders
 * `{ id, name }`. This pure helper turns that stack (plus an always-present
 * "Drive" root) into renderable breadcrumb segments, and supports truncating to
 * the last N entries with a leading ellipsis for deep trees.
 */

export interface FolderCrumb {
	id: string;
	name: string;
}

export interface BreadcrumbSegment {
	/** `null` = the Drive root (top of the tree). */
	id: string | null;
	label: string;
	isCurrent: boolean;
}

export const ROOT_CRUMB_LABEL = "Диск";

export function breadcrumbPath(
	stack: FolderCrumb[],
	rootLabel: string = ROOT_CRUMB_LABEL,
): BreadcrumbSegment[] {
	const segments: BreadcrumbSegment[] = [
		{ id: null, label: rootLabel, isCurrent: stack.length === 0 },
	];
	stack.forEach((crumb, index) => {
		segments.push({
			id: crumb.id,
			label: crumb.name,
			isCurrent: index === stack.length - 1,
		});
	});
	return segments;
}

/** Trim the stack back to (and including) the clicked folder id. */
export function truncateStackTo(
	stack: FolderCrumb[],
	folderId: string | null,
): FolderCrumb[] {
	if (folderId === null) return [];
	const index = stack.findIndex((crumb) => crumb.id === folderId);
	return index === -1 ? stack : stack.slice(0, index + 1);
}
