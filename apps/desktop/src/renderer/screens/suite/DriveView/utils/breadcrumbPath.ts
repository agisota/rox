/**
 * Breadcrumb derivation for the desktop Drive browser.
 *
 * Ported from `apps/web/src/app/drive/utils/breadcrumbPath` so web + desktop
 * navigate identically. `drive.listFolder` returns only the *children* of a
 * folder, not its ancestor chain, so the UI tracks navigation as a stack of
 * visited folders `{ id, name }`. This pure helper turns that stack (plus an
 * always-present "Диск" root) into renderable breadcrumb segments and supports
 * truncating to the last N entries with a leading ellipsis for deep trees.
 *
 * (Spec step 6 calls for extracting this into a shared `@rox/shared/drive`
 * module consumed by web + desktop + mobile; that is a cross-package change
 * outside this surface, so the desktop copy lives here for now.)
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

/** Show at most this many trailing crumbs before collapsing the middle. */
const MAX_VISIBLE = 4;

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

/**
 * Collapse a long segment list to `root … last (MAX_VISIBLE - 1)` so a deep
 * tree never overflows the toolbar. Returns the kept segments plus whether an
 * ellipsis gap was introduced (the caller renders a `BreadcrumbEllipsis`).
 */
export function truncateSegments(segments: BreadcrumbSegment[]): {
	head: BreadcrumbSegment;
	collapsed: boolean;
	tail: BreadcrumbSegment[];
} {
	const [head, ...rest] = segments;
	if (rest.length <= MAX_VISIBLE) {
		return { head, collapsed: false, tail: rest };
	}
	return { head, collapsed: true, tail: rest.slice(rest.length - MAX_VISIBLE) };
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
