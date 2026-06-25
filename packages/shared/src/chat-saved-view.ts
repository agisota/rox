/**
 * Serializable filter expression + Smart-Folder presets for chat Saved Views
 * (Hermes-borrow F17). This is the single cross-platform core: the rule is a
 * plain, JSON-serialisable object that round-trips unchanged through Postgres
 * (`chat_saved_views.rule` jsonb), tRPC, IPC, and React Native navigation params
 * — so web, desktop, and mobile evaluate one definition of a Saved View.
 *
 * A *Saved View* names a reusable boolean tag filter over the chat list. A
 * *Smart Folder* is a built-in Saved View whose rule is a fixed preset
 * (Untagged, Has errors, CLI, Touched today, @me). Both reduce to the same
 * {@link SavedViewRule} and the same `listSessions` input mapping, so a surface
 * renders them through one code path.
 *
 * Pure: no DOM, no React, no I/O — fully unit-testable without a live database
 * or tRPC client (mirrors `chat/labels-schema.ts` and `notebooks/search-notes`).
 *
 * Tags ⟂ identity: the label axes are the organization axis only, never the
 * persona/org (who/where) axis.
 */

import { z } from "zod";

/** Lifecycle facet of a chat session (mirrors `chatSessionStatusValues`). */
export const SAVED_VIEW_STATUS_VALUES = ["active", "archived"] as const;
export type SavedViewStatus = (typeof SAVED_VIEW_STATUS_VALUES)[number];

/** A non-empty, trimmed label name (membership keys in `chat_sessions.labels`). */
const ruleLabelName = z.string().trim().min(1).max(60);

/**
 * The serialisable boolean tag-filter expression backing a Saved View. Every
 * field is optional and AND-composes (F17 boolean multi-tag):
 *   - `labelsAll`  → session has *every* listed label (AND).
 *   - `labelsAny`  → session has *at least one* listed label (OR).
 *   - `labelsNone` → session has *none* of the listed labels (NOT).
 *   - `untagged`   → session has *no* labels at all (Smart Folder "Untagged").
 *   - `status`     → lifecycle facet (active|archived).
 *
 * `untagged` is a distinct flag rather than `labelsNone` of every label so the
 * rule stays stable as the label registry changes (a new label must not silently
 * fall out of an "Untagged" view).
 */
export const savedViewRuleSchema = z
	.object({
		labelsAll: z.array(ruleLabelName).min(1).optional(),
		labelsAny: z.array(ruleLabelName).min(1).optional(),
		labelsNone: z.array(ruleLabelName).min(1).optional(),
		untagged: z.boolean().optional(),
		status: z.enum(SAVED_VIEW_STATUS_VALUES).optional(),
	})
	.strict();

export type SavedViewRule = z.infer<typeof savedViewRuleSchema>;

/** The empty rule — matches every session (an unfiltered view). */
export const EMPTY_SAVED_VIEW_RULE: SavedViewRule = {};

/** Stable ids for the built-in Smart Folders (never reorder/remove — persisted). */
export type SmartFolderId =
	| "untagged"
	| "has-errors"
	| "cli"
	| "touched-today"
	| "me";

/** A built-in Smart Folder: a fixed preset rule plus its display metadata. */
export interface SmartFolder {
	/** Stable preset id (also the React key / `data-folder` token). */
	id: SmartFolderId;
	/** Display label. */
	name: string;
	/** Optional icon token (icon name / emoji) for the rail. */
	icon?: string;
	/**
	 * The preset's serialisable rule. Server-evaluable folders ("Untagged") map
	 * directly to `listSessions` params; client-only folders ("Has errors",
	 * "CLI", "Touched today", "@me") carry an empty server rule and are refined
	 * locally via {@link smartFolderClientPredicate}.
	 */
	rule: SavedViewRule;
	/**
	 * Whether the folder is fully resolved by the server rule alone. `false`
	 * folders need {@link smartFolderClientPredicate} to refine the result set
	 * (their criterion is per-session metadata the list query doesn't filter on).
	 */
	serverComplete: boolean;
}

/**
 * The built-in Smart Folders rendered ahead of user Saved Views in the rail.
 * Ordered for display. "Untagged" is server-complete; the rest refine
 * client-side over the row's derived metadata.
 */
export const SMART_FOLDERS: readonly SmartFolder[] = [
	{
		id: "untagged",
		name: "Untagged",
		icon: "tag-off",
		rule: { untagged: true },
		serverComplete: true,
	},
	{
		id: "has-errors",
		name: "Has errors",
		icon: "alert-triangle",
		rule: {},
		serverComplete: false,
	},
	{
		id: "cli",
		name: "CLI",
		icon: "terminal",
		rule: {},
		serverComplete: false,
	},
	{
		id: "touched-today",
		name: "Touched today",
		icon: "clock",
		rule: {},
		serverComplete: false,
	},
	{
		id: "me",
		name: "@me",
		icon: "user",
		rule: {},
		serverComplete: false,
	},
] as const;

/** The `chat.listSessions` filter-input slice ({} when unfiltered). */
export interface SavedViewListSessionsInput {
	labelsAll?: string[];
	labelsAny?: string[];
	labelsNone?: string[];
	status?: SavedViewStatus;
}

/**
 * Map a Saved-View rule to the `listSessions` server input. Empty arrays and
 * absent fields contribute nothing, so the empty rule yields `{}` (the previous
 * unfiltered behaviour). `untagged` carries no server param — the caller refines
 * it client-side via {@link sessionMatchesRule} / {@link ruleIsServerComplete},
 * because "session has no labels" isn't expressible through the boolean
 * label-containment axes. Returns a fresh object so it spreads safely into a
 * query key.
 */
export function savedViewRuleToListInput(
	rule: SavedViewRule,
): SavedViewListSessionsInput {
	const input: SavedViewListSessionsInput = {};
	if (rule.labelsAll && rule.labelsAll.length > 0) {
		input.labelsAll = [...rule.labelsAll];
	}
	if (rule.labelsAny && rule.labelsAny.length > 0) {
		input.labelsAny = [...rule.labelsAny];
	}
	if (rule.labelsNone && rule.labelsNone.length > 0) {
		input.labelsNone = [...rule.labelsNone];
	}
	if (rule.status) {
		input.status = rule.status;
	}
	return input;
}

/**
 * Whether a rule is fully resolved by the server input alone. `untagged` is the
 * only axis the server input can't express, so a rule with `untagged` set always
 * needs a client refinement pass.
 */
export function ruleIsServerComplete(rule: SavedViewRule): boolean {
	return rule.untagged !== true;
}

/**
 * Whether a session with `sessionLabels` (and lifecycle `status`) passes the
 * rule *client-side*. Used for the `untagged` axis (no server param) and as a
 * cheap local refinement of the label axes. AND-composes every present axis; an
 * empty rule always passes.
 */
export function sessionMatchesRule(
	rule: SavedViewRule,
	session: { labels: readonly string[]; status?: SavedViewStatus },
): boolean {
	const labels = session.labels;

	if (rule.untagged === true && labels.length > 0) {
		return false;
	}
	if (rule.status && session.status && session.status !== rule.status) {
		return false;
	}
	if (
		rule.labelsAll &&
		!rule.labelsAll.every((name) => labels.includes(name))
	) {
		return false;
	}
	if (
		rule.labelsAny &&
		rule.labelsAny.length > 0 &&
		!rule.labelsAny.some((name) => labels.includes(name))
	) {
		return false;
	}
	if (rule.labelsNone?.some((name) => labels.includes(name))) {
		return false;
	}
	return true;
}

/**
 * The metadata a client-only Smart Folder refines over. A surface fills in what
 * it knows from the chat row; absent fields make the predicate conservative
 * (the folder simply matches nothing it can't prove).
 */
export interface SmartFolderSessionMeta {
	/** Whether the session has any error/failed turn (drives "Has errors"). */
	hasErrors?: boolean;
	/** Origin of the session (drives "CLI"). */
	source?: string;
	/** Last activity timestamp in ms (drives "Touched today"). */
	lastActiveAtMs?: number;
	/** Author user id (drives "@me"). */
	createdBy?: string;
}

/** Context the "@me" / "Touched today" predicates resolve against. */
export interface SmartFolderContext {
	/** The viewing user's id (for "@me"). */
	currentUserId?: string;
	/** "Now" in ms, injectable so the predicate is deterministic in tests. */
	nowMs?: number;
}

/** Whether two epoch-ms timestamps fall on the same local calendar day. */
function isSameLocalDay(aMs: number, bMs: number): boolean {
	const a = new Date(aMs);
	const b = new Date(bMs);
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/**
 * Client-side predicate for the non-server-complete Smart Folders. Returns
 * `true` when the session's metadata satisfies the folder's criterion. Unknown
 * folders and folders whose required metadata is absent return `false` (the
 * folder conservatively excludes rows it can't classify).
 */
export function smartFolderClientPredicate(
	folderId: SmartFolderId,
	meta: SmartFolderSessionMeta,
	context: SmartFolderContext = {},
): boolean {
	switch (folderId) {
		case "untagged":
			// Server-complete; nothing to refine. Pass-through.
			return true;
		case "has-errors":
			return meta.hasErrors === true;
		case "cli":
			return meta.source === "cli" || meta.source === "claude-code";
		case "touched-today": {
			if (meta.lastActiveAtMs === undefined) {
				return false;
			}
			return isSameLocalDay(meta.lastActiveAtMs, context.nowMs ?? Date.now());
		}
		case "me":
			return (
				context.currentUserId !== undefined &&
				meta.createdBy === context.currentUserId
			);
		default:
			return false;
	}
}

/** Look up a Smart Folder preset by id. */
export function getSmartFolder(id: SmartFolderId): SmartFolder | undefined {
	return SMART_FOLDERS.find((folder) => folder.id === id);
}
