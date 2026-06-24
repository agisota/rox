import type { DriveFile, DriveFolder, EntryRef } from "../types";

/**
 * The single prop contract shared by {@link DriveListView} and
 * {@link DriveGridView} so both render the same data over one selection +
 * interaction model. DriveView builds this once and hands it to whichever view
 * is active, guaranteeing identical behaviour across Список/Сетка.
 */
export interface DriveBrowserModel {
	folders: DriveFolder[];
	files: DriveFile[];

	/** Selection set keyed by `${kind}:${id}` (see `refKey`). */
	selected: ReadonlySet<string>;
	/** Inline-rename target, or null. */
	renaming: EntryRef | null;

	/** Single click — selection (modifier-aware multi-select). */
	onSelect: (
		ref: EntryRef,
		event: { metaKey: boolean; shiftKey: boolean },
	) => void;
	/** Double click / Enter — drill into folder or preview file. */
	onOpenFolder: (folder: DriveFolder) => void;
	onOpenFile: (file: DriveFile) => void;

	onStartRename: (ref: EntryRef) => void;
	onCommitRename: (ref: EntryRef, name: string) => void;
	onCancelRename: () => void;

	onDownload: (fileId: string) => void;
	onShareFolder: (folder: DriveFolder) => void;
	onShareFile: (file: DriveFile) => void;
	onCopyLinkFolder: (folder: DriveFolder) => void;
	onCopyLinkFile: (file: DriveFile) => void;
	onDeleteFolder: (folder: DriveFolder) => void;
	onDeleteFile: (file: DriveFile) => void;
}
