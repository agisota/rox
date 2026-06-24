import { type DragEvent, useCallback, useRef, useState } from "react";

/**
 * Whole-area drag-and-drop for the Drive main pane. Mirrors the desktop
 * precedent in `useFilesTabDrop`: dragover hysteresis (so the glass scrim does
 * not flicker as the cursor crosses child elements) and recursive
 * `webkitGetAsEntry` traversal so dropping a *folder* uploads all its files.
 *
 * Unlike `useFilesTabDrop` (which writes to a worktree via filesystem IPC),
 * Drive uploads go through the presigned R2 pipeline, so this hook only
 * *collects* `File[]` and hands them to the caller's upload runner. Internal
 * dnd-kit item-move drags (P1) carry no OS `Files`, so they are ignored here.
 */

/** True when the drag carries OS files (vs. an internal/text drag). */
function dragHasFiles(event: DragEvent): boolean {
	return Array.from(event.dataTransfer.types).includes("Files");
}

interface FileSystemEntryLike {
	isFile: boolean;
	isDirectory: boolean;
	file?: (cb: (file: File) => void, err: (e: unknown) => void) => void;
	createReader?: () => {
		readEntries: (
			cb: (entries: FileSystemEntryLike[]) => void,
			err: (e: unknown) => void,
		) => void;
	};
}

function readEntryFile(entry: FileSystemEntryLike): Promise<File | null> {
	return new Promise((resolve) => {
		entry.file?.(
			(file) => resolve(file),
			() => resolve(null),
		);
	});
}

function readDirectory(
	entry: FileSystemEntryLike,
): Promise<FileSystemEntryLike[]> {
	const reader = entry.createReader?.();
	if (!reader) return Promise.resolve([]);
	// readEntries returns at most ~100 entries per call; loop until drained.
	return new Promise((resolve) => {
		const all: FileSystemEntryLike[] = [];
		const pump = () => {
			reader.readEntries(
				(batch) => {
					if (batch.length === 0) {
						resolve(all);
						return;
					}
					all.push(...batch);
					pump();
				},
				() => resolve(all),
			);
		};
		pump();
	});
}

/** Depth-first flatten of an entry (file or directory) into plain `File`s. */
async function collectEntry(entry: FileSystemEntryLike): Promise<File[]> {
	if (entry.isFile) {
		const file = await readEntryFile(entry);
		return file ? [file] : [];
	}
	if (entry.isDirectory) {
		const children = await readDirectory(entry);
		const nested = await Promise.all(children.map(collectEntry));
		return nested.flat();
	}
	return [];
}

/** Flatten a `DataTransferItemList` into `File[]`, traversing dropped folders. */
async function collectFiles(items: DataTransferItemList): Promise<File[]> {
	const entries: FileSystemEntryLike[] = [];
	const plainFiles: File[] = [];
	for (const item of Array.from(items)) {
		const asAny = item as DataTransferItem & {
			webkitGetAsEntry?: () => FileSystemEntryLike | null;
		};
		const entry = asAny.webkitGetAsEntry?.() ?? null;
		if (entry) {
			entries.push(entry);
		} else {
			const file = item.getAsFile();
			if (file) plainFiles.push(file);
		}
	}
	const traversed = await Promise.all(entries.map(collectEntry));
	return [...plainFiles, ...traversed.flat()];
}

export interface DriveDrop {
	/** True while an external OS-file drag hovers the pane. */
	isDragging: boolean;
	onDragEnter(event: DragEvent<HTMLDivElement>): void;
	onDragOver(event: DragEvent<HTMLDivElement>): void;
	onDragLeave(event: DragEvent<HTMLDivElement>): void;
	onDrop(event: DragEvent<HTMLDivElement>): void;
}

export function useDriveDrop(
	onFiles: (files: File[]) => void,
	enabled = true,
): DriveDrop {
	const [isDragging, setIsDragging] = useState(false);
	// Hysteresis: count enter/leave so crossing child borders does not drop us.
	const depth = useRef(0);

	const onDragEnter = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			if (!enabled || !dragHasFiles(event)) return;
			event.preventDefault();
			depth.current += 1;
			setIsDragging(true);
		},
		[enabled],
	);

	const onDragOver = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			if (!enabled || !dragHasFiles(event)) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = "copy";
		},
		[enabled],
	);

	const onDragLeave = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			if (!enabled || !dragHasFiles(event)) return;
			event.preventDefault();
			depth.current = Math.max(0, depth.current - 1);
			if (depth.current === 0) setIsDragging(false);
		},
		[enabled],
	);

	const onDrop = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			if (!enabled || !dragHasFiles(event)) return;
			event.preventDefault();
			depth.current = 0;
			setIsDragging(false);
			void collectFiles(event.dataTransfer.items).then((files) => {
				if (files.length > 0) onFiles(files);
			});
		},
		[enabled, onFiles],
	);

	return { isDragging, onDragEnter, onDragOver, onDragLeave, onDrop };
}
