import type { SelectSavedPrompt } from "@rox/local-db";

/**
 * Client-side metadata we attach to a prompt without a schema migration.
 *
 * The `saved_prompts` table is local-only and exposes just {id,title,body}.
 * Rather than block the library upgrade on a shared Drizzle migration (which we
 * cannot make from this surface), we encode favorites / tags / usage into a
 * tiny, hidden frontmatter block at the END of the `body` column (see
 * `prompt-metadata.ts`). Decoding strips it back out, so the visible/editable
 * body is always the clean prompt text and old rows (no block) just decode to
 * empty metadata. Fully reversible and forward-compatible with a future real
 * migration.
 */
export interface PromptMetadata {
	tags: string[];
	favorite: boolean;
	/** Times this prompt was inserted/copied. Drives «Часто используемые». */
	useCount: number;
	/** Epoch ms of last insert/copy. Drives «Недавние». */
	lastUsedAt: number | null;
}

/** A saved prompt with its hidden metadata decoded and body cleaned. */
export interface PromptEntry {
	id: string;
	title: string;
	/** Clean prompt text (metadata block stripped). */
	body: string;
	createdAt: number;
	updatedAt: number;
	tags: string[];
	favorite: boolean;
	useCount: number;
	lastUsedAt: number | null;
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
	| { kind: "tag"; tag: string };

export const RAIL_ALL: RailFilter = { kind: "all" };
export const RAIL_FAVORITES: RailFilter = { kind: "favorites" };
export const RAIL_RECENT: RailFilter = { kind: "recent" };
