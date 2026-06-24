import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type DriveFile,
	type DriveFolder,
	SORT_STORAGE_KEY,
	type SortState,
	VIEW_STORAGE_KEY,
	type ViewMode,
} from "../types";

/** Read a JSON-ish value from localStorage with a typed fallback. */
function readStored<T>(
	key: string,
	fallback: T,
	validate: (v: unknown) => v is T,
): T {
	if (typeof window === "undefined") return fallback;
	try {
		const raw = window.localStorage.getItem(key);
		if (raw === null) return fallback;
		const parsed = JSON.parse(raw) as unknown;
		return validate(parsed) ? parsed : fallback;
	} catch {
		return fallback;
	}
}

const isViewMode = (v: unknown): v is ViewMode => v === "list" || v === "grid";
const isSortState = (v: unknown): v is SortState =>
	typeof v === "object" &&
	v !== null &&
	["name", "size", "date"].includes((v as SortState).field) &&
	["asc", "desc"].includes((v as SortState).dir);

/**
 * View preferences (mode + sort) for the Drive browser, persisted to
 * localStorage so a reload restores the user's Сетка/Список choice and sort —
 * matching the spec's `rox.drive.view` requirement. Pure client state; no tRPC.
 */
export function useDriveViewState() {
	const [view, setView] = useState<ViewMode>(() =>
		readStored(VIEW_STORAGE_KEY, "list", isViewMode),
	);
	const [sort, setSort] = useState<SortState>(() =>
		readStored(SORT_STORAGE_KEY, { field: "name", dir: "asc" }, isSortState),
	);

	useEffect(() => {
		try {
			window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
		} catch {
			/* storage may be unavailable; preference is non-critical */
		}
	}, [view]);

	useEffect(() => {
		try {
			window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
		} catch {
			/* non-critical */
		}
	}, [sort]);

	const toggleSort = useCallback((field: SortState["field"]) => {
		setSort((prev) =>
			prev.field === field
				? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
				: { field, dir: "asc" },
		);
	}, []);

	return { view, setView, sort, setSort, toggleSort };
}

function ts(value: string | Date): number {
	return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Filter (debounced query, case-insensitive) + sort folders and files for the
 * current folder. Folders always sort above files (file-manager convention);
 * within each group the active sort field/direction applies. Pure + memoised.
 */
export function useDriveListing(
	folders: DriveFolder[],
	files: DriveFile[],
	query: string,
	sort: SortState,
): { folders: DriveFolder[]; files: DriveFile[] } {
	return useMemo(() => {
		const q = query.trim().toLowerCase();
		const matchFolder = (f: DriveFolder) =>
			q === "" || f.name.toLowerCase().includes(q);
		const matchFile = (f: DriveFile) =>
			q === "" || f.name.toLowerCase().includes(q);

		const dir = sort.dir === "asc" ? 1 : -1;

		const sortedFolders = folders.filter(matchFolder).sort((a, b) => {
			// Folders have no size; fall back to name/date.
			if (sort.field === "date")
				return dir * (ts(a.createdAt) - ts(b.createdAt));
			return dir * a.name.localeCompare(b.name, "ru");
		});

		const sortedFiles = files.filter(matchFile).sort((a, b) => {
			switch (sort.field) {
				case "size":
					return dir * (a.sizeBytes - b.sizeBytes);
				case "date":
					return dir * (ts(a.createdAt) - ts(b.createdAt));
				default:
					return dir * a.name.localeCompare(b.name, "ru");
			}
		});

		return { folders: sortedFolders, files: sortedFiles };
	}, [folders, files, query, sort]);
}
