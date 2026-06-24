/**
 * Shared view-model types for the desktop Drive surface. The tRPC router
 * (`drive.listFolder`) returns full Drizzle rows; the browser only needs a thin
 * slice, normalised here so the List and Grid renderers share one selection +
 * sort model regardless of the underlying row shape.
 */

/** A folder row as the browser consumes it. */
export interface DriveFolder {
	id: string;
	name: string;
	createdAt: string | Date;
}

/** A file row as the browser consumes it. */
export interface DriveFile {
	id: string;
	name: string;
	mediaType: string;
	sizeBytes: number;
	createdAt: string | Date;
	/** Server scan state — only `clean` files are downloadable / previewable. */
	status: "pending" | "scanning" | "clean" | "quarantined";
	folderId: string | null;
}

/** Stable identity for the selection set: kind + id. */
export type EntryRef =
	| { kind: "folder"; id: string }
	| { kind: "file"; id: string };

export type ViewMode = "list" | "grid";

export type SortField = "name" | "size" | "date";
export type SortDir = "asc" | "desc";

export interface SortState {
	field: SortField;
	dir: SortDir;
}

/** localStorage keys for persisted view preferences. */
export const VIEW_STORAGE_KEY = "rox.drive.view";
export const SORT_STORAGE_KEY = "rox.drive.sort";

/** Build the selection-set key for an entry. */
export function refKey(ref: EntryRef): string {
	return `${ref.kind}:${ref.id}`;
}
