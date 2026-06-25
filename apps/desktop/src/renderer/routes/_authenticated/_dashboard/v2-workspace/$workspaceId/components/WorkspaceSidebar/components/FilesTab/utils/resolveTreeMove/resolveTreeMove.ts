import { basename, parentRel, stripTrailingSlash } from "../treePath";

/** Outcome of resolving one intra-tree drag-move against its destination. */
export type TreeMoveResolution =
	| { ok: true; sourcePath: string; destinationPath: string }
	| { ok: false; reason: TreeMoveSkipReason };

/** Why a drag-move was rejected before any filesystem call. */
export type TreeMoveSkipReason =
	/** Source already lives directly in the destination folder. */
	| "same-parent"
	/** Destination is the dragged folder itself or one of its descendants. */
	| "into-self";

/**
 * Resolve a single intra-tree drag-move into the Pierre tree paths the move
 * would produce, or a skip reason when the move is a no-op or illegal.
 *
 * Paths are Pierre's tree keys (relative to the worktree root): directories
 * carry a trailing slash, files don't. `destDirRel` is the destination
 * directory's relative path without a trailing slash ("" = worktree root,
 * matching `FileTreeDropTarget.directoryPath === null`).
 *
 * Kept pure (no model/bridge access) so the guard logic — which prevents
 * dropping a folder into itself and skips no-op same-parent drops — is unit
 * testable without a rendered tree.
 */
export function resolveTreeMove(
	sourcePath: string,
	destDirRel: string,
	isFolder: boolean,
): TreeMoveResolution {
	const sourceRel = stripTrailingSlash(sourcePath);
	const destDir = stripTrailingSlash(destDirRel);

	// Dropping into the folder that already holds the source is a no-op.
	if (parentRel(sourceRel) === destDir) {
		return { ok: false, reason: "same-parent" };
	}

	// A folder can't move into itself or any of its own descendants — that
	// would orphan the subtree. `destDir === sourceRel` covers the folder
	// itself; the prefix check covers nested descendants.
	if (
		isFolder &&
		(destDir === sourceRel || destDir.startsWith(`${sourceRel}/`))
	) {
		return { ok: false, reason: "into-self" };
	}

	const name = basename(sourceRel);
	const destRel = destDir ? `${destDir}/${name}` : name;
	const suffix = isFolder ? "/" : "";

	return {
		ok: true,
		sourcePath: `${sourceRel}${suffix}`,
		destinationPath: `${destRel}${suffix}`,
	};
}
