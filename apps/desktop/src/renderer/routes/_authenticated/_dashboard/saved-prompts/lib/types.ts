import type { SelectSavedPrompt } from "@rox/local-db";

/**
 * A saved prompt as the library UI consumes it. Tags, favorite, usage, folder
 * and ordering now live in real `saved_prompts` columns; this type is a thin
 * view over the DB row plus the variable names parsed from the body. (The
 * legacy hidden-`<!--rox:meta-->` body codec was removed once the schema gained
 * these columns; a server-side backfill migrates any surviving blocks.)
 */
export interface PromptEntry {
	id: string;
	title: string;
	/** Clean prompt text. */
	body: string;
	createdAt: number;
	updatedAt: number;
	/** Folder this prompt is filed under, or null for the unfiled root. */
	folder: string | null;
	tags: string[];
	favorite: boolean;
	/** Times this prompt was inserted/copied. Drives «Часто используемые». */
	useCount: number;
	/** Epoch ms of last insert/copy. Drives «Недавние». */
	lastUsedAt: number | null;
	/** Manual drag-sort position; null until first ordered. */
	position: number | null;
	/** Unique `{{variable}}` names parsed from `body`, in first-seen order. */
	variableNames: string[];
}

/** The raw DB row shape we read from `savedPrompts.list`. */
export type RawSavedPrompt = SelectSavedPrompt;

/** Which collection/filter the left rail has selected. */
export type RailFilter =
	| { kind: "all" }
	| { kind: "favorites" }
	| { kind: "recent" }
	| { kind: "frequent" }
	| { kind: "tag"; tag: string }
	| { kind: "folder"; folder: string };

export const RAIL_ALL: RailFilter = { kind: "all" };
export const RAIL_FAVORITES: RailFilter = { kind: "favorites" };
export const RAIL_RECENT: RailFilter = { kind: "recent" };
export const RAIL_FREQUENT: RailFilter = { kind: "frequent" };
