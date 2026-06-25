import type { EntryRef } from "../types";
import { refKey } from "../types";

/**
 * Pure, platform-agnostic drag-and-drop model for the Drive browser.
 *
 * dnd-kit is the renderer-side edge adapter (mouse + touch + keyboard sensors);
 * everything here — the drag payload shape, the droppable id encoding and the
 * "can this move land?" guard — is pure data so the same move semantics can be
 * reused by web + mobile + a future left-tree without dragging dnd-kit along.
 *
 * Internal item-move drags carry their payload through dnd-kit's `active.data`,
 * never through the OS `DataTransfer`, so {@link useDriveDrop}'s `Files`-typed
 * OS-upload drop path and this internal move path never collide (issue #579).
 */

/** What a draggable Drive entry carries while in flight. */
export interface DriveDragData {
	/** The entry the pointer grabbed. */
	ref: EntryRef;
	/** The full set being moved (the grabbed entry plus any co-selected ones). */
	refs: EntryRef[];
	/** Display label for the {@link DragOverlay} ghost. */
	label: string;
}

/** Where a drop can land. */
export type DriveDropTarget = { kind: "folder"; id: string } | { kind: "root" };

/** Stable dnd-kit droppable id for a target folder (or the Drive root). */
export function dropTargetId(target: DriveDropTarget): string {
	return target.kind === "root" ? "drop:root" : `drop:folder:${target.id}`;
}

/** Stable dnd-kit draggable id for an entry. */
export function dragId(ref: EntryRef): string {
	return `drag:${refKey(ref)}`;
}

/**
 * Whether a move is permitted from the UI's point of view. We block the two
 * cases the user can see locally: dropping onto the folder you are already in
 * (a no-op) and dropping a folder onto itself. Deeper "into my own descendant"
 * cases need the ancestor chain the client does not hold (listFolder returns
 * only direct children), so the router's BAD_REQUEST is the backstop, surfaced
 * as a toast + optimistic rollback.
 */
export function isDropAllowed(
	refs: EntryRef[],
	target: DriveDropTarget,
	currentFolderId: string | null,
): boolean {
	if (refs.length === 0) return false;
	const targetId = target.kind === "root" ? null : target.id;
	// Already living in the target folder → nothing to do.
	if (targetId === currentFolderId) return false;
	// A folder cannot be dropped onto itself.
	if (
		target.kind === "folder" &&
		refs.some((r) => r.kind === "folder" && r.id === target.id)
	) {
		return false;
	}
	return true;
}

/** Resolve the effective set being dragged: the grabbed ref, expanded to the
 * current multi-selection when the grabbed ref is part of it. */
export function dragRefs(
	grabbed: EntryRef,
	selected: ReadonlySet<string>,
	allRefs: EntryRef[],
): EntryRef[] {
	if (!selected.has(refKey(grabbed))) return [grabbed];
	const inSelection = allRefs.filter((r) => selected.has(refKey(r)));
	return inSelection.length > 0 ? inSelection : [grabbed];
}
