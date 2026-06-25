/**
 * Shared types for the unified inbox (notifications / triage) surface.
 *
 * The inbox merges three transports into one normalized stream so the list,
 * filter rail, keyboard triage, and reader can all operate on a single row
 * shape regardless of whether the underlying row came from `comms.*` (chat),
 * `mail.*` (email), or the system notifications aggregator (PR/checks/
 * automations/agent gates — P1).
 */

/** Which transport a normalized inbox row originated from. */
export type InboxSource = "chat" | "mail" | "system";

/**
 * The "go to source" target for a `source: "system"` row. A tagged union so the
 * reader can dispatch the right primary action (open the PR in the browser,
 * navigate to the workspace, open the automation, or reply to the agent)
 * without parsing free-form strings. Platform-neutral: the renderer resolves
 * each tag into a real `window.open(...)` / `navigate(...)` at the edge.
 */
export type SystemAction =
	| { kind: "open-pr"; url: string }
	| { kind: "open-workspace"; workspaceId: string }
	| { kind: "open-automation"; automationId: string }
	| { kind: "reply-agent"; workspaceId: string };

/** Left-rail filter slice (a superset of {@link InboxSource} + triage views). */
export type InboxFilter =
	| "all"
	| "chat"
	| "mail"
	| "system"
	| "snoozed"
	| "archive";

/** Unread-vs-all status segment (top bar + rail footer toggle). */
export type InboxStatusFilter = "unread" | "all";

/**
 * One normalized inbox row. `key` is the stable cross-transport identity used
 * for selection, dedupe, and the local triage store; it is `${source}:${id}`.
 */
export interface InboxItem {
	/** Stable dedupe/selection key: `${source}:${threadId}`. */
	key: string;
	source: InboxSource;
	/** The transport-native thread id (feeds `*.getThread`). */
	threadId: string;
	/** Human title for the row (subject or a derived fallback). */
	title: string;
	/** One-line preview of the latest activity (snippet / derived). */
	preview: string;
	/** Time of the latest event in the thread (drives sort + relative time). */
	timestamp: Date | null;
	/** Caller's unread count for the thread (0 when read / unknown). */
	unreadCount: number;
	/**
	 * Primary "go to source" action for a `source: "system"` row (PR / automation
	 * / agent gate). Undefined for chat/mail rows, which route to their own
	 * transport reader instead.
	 */
	systemAction?: SystemAction;
}

/** A snooze entry: a row hidden from the active stream until `until`. */
export interface SnoozeEntry {
	until: number;
}

/**
 * The local (pre-backend) triage state. Archive is a set of item keys; snooze
 * maps an item key to its wake time. Persisted to `localStorage` as the MVP
 * stand-in for the future `inbox.archive` / `inbox.snooze` per-user store.
 */
export interface InboxTriageState {
	archived: Record<string, true>;
	snoozed: Record<string, SnoozeEntry>;
}
