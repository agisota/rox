import { create } from "zustand";

/**
 * The global in-app notification feed backing the top-bar bell.
 *
 * WHY A NEW STORE (and not `stores/v2-notifications`): that store is a per-pane
 * *status indicator* map (working/review/permission) keyed by workspace — it
 * answers "does this workspace need attention right now?", not "what happened
 * recently?". The bell needs a durable, ordered *feed* of discrete events
 * (new mail, agent finished, automation done, mention, PR review) with a
 * read/unread watermark. The two are orthogonal, so this is a separate store.
 *
 * SOURCE OF TRUTH (no fake data): entries are appended ONLY by
 * `NotificationBellController`, which subscribes to the two real live event
 * seams already present in the renderer:
 *   1. the comms SSE stream (`/api/comms/stream`) → new mail + chat/mention, and
 *   2. `electronTrpc.notifications.subscribe` → agent lifecycle (Stop /
 *      PermissionRequest / PendingQuestion).
 * There is no polling and no seeded content; an empty feed renders an honest
 * empty state.
 *
 * The feed is process-local and intentionally NOT persisted: it is a live
 * "what just happened" surface, and the authoritative records (the mail thread,
 * the chat thread, the workspace) already live in their own stores. Capping at
 * {@link MAX_ENTRIES} keeps the panel bounded without a durable backlog.
 */

/** The discrete kinds of in-app notification the bell aggregates. */
export type NotificationKind =
	| "mail"
	| "chat"
	| "mention"
	| "agent"
	| "automation"
	| "pr-review";

/**
 * A navigation target for a feed entry. Mirrors the subset of TanStack Router
 * `to`/`params` shapes the bell needs; resolved by the panel into a real
 * `navigate(...)` call. Kept as a tagged union so the panel can route without a
 * free-form string.
 */
export type NotificationTarget =
	| { to: "/email" }
	| { to: "/inbox" }
	| { to: "/automations" }
	| { to: "/tasks" }
	| { to: "/journal" }
	| { to: "/v2-workspace/$workspaceId"; workspaceId: string };

/** One row in the bell feed. */
export interface NotificationEntry {
	/** Stable id (dedupe + React key + per-entry read marking). */
	id: string;
	kind: NotificationKind;
	/** Short RU title (e.g. "Новое письмо"). */
	title: string;
	/** One-line RU preview/body (sender, subject, workspace name, …). */
	body: string;
	/** Event time (epoch ms) — drives sort + the relative-time label. */
	at: number;
	/** Where clicking the entry navigates. */
	target: NotificationTarget;
	/** Per-entry read flag (set when the entry is opened/clicked). */
	read: boolean;
}

/** The minimal shape a producer supplies; the store fills `read`. */
export type NotificationInput = Omit<NotificationEntry, "read">;

const MAX_ENTRIES = 50;

export interface NotificationFeedState {
	/** Newest-first list of recent notifications (capped at {@link MAX_ENTRIES}). */
	entries: NotificationEntry[];
	/**
	 * Watermark: every entry with `at <= lastReadAt` is considered seen. Drives
	 * the unread badge alongside the per-entry `read` flag (an entry counts as
	 * unread only when `!read && at > lastReadAt`).
	 */
	lastReadAt: number;
	/** Append one event (de-duplicated by id; newest-first; capped). */
	add: (input: NotificationInput) => void;
	/** Mark a single entry read (on click-through). */
	markRead: (id: string) => void;
	/** Mark the whole feed read + advance the watermark (on panel open). */
	markAllRead: () => void;
	/** Drop every entry (and reset the watermark). */
	clear: () => void;
}

export const useNotificationFeedStore = create<NotificationFeedState>()(
	(set) => ({
		entries: [],
		lastReadAt: 0,
		add: (input) => {
			set((state) => {
				// Idempotent: a re-delivered event (SSE reconnect, double hook) with the
				// same id never produces a duplicate row.
				if (state.entries.some((entry) => entry.id === input.id)) {
					return state;
				}
				const entry: NotificationEntry = { ...input, read: false };
				const next = [entry, ...state.entries]
					.sort((a, b) => b.at - a.at)
					.slice(0, MAX_ENTRIES);
				return { entries: next };
			});
		},
		markRead: (id) => {
			set((state) => {
				let changed = false;
				const entries = state.entries.map((entry) => {
					if (entry.id === id && !entry.read) {
						changed = true;
						return { ...entry, read: true };
					}
					return entry;
				});
				return changed ? { entries } : state;
			});
		},
		markAllRead: () => {
			set((state) => {
				const now = Date.now();
				if (state.entries.every((entry) => entry.read)) {
					return state.lastReadAt >= now ? state : { lastReadAt: now };
				}
				return {
					lastReadAt: now,
					entries: state.entries.map((entry) =>
						entry.read ? entry : { ...entry, read: true },
					),
				};
			});
		},
		clear: () => set({ entries: [], lastReadAt: Date.now() }),
	}),
);

/** Count of unread entries (drives the bell badge). */
export function selectUnreadCount(state: NotificationFeedState): number {
	let count = 0;
	for (const entry of state.entries) {
		if (!entry.read && entry.at > state.lastReadAt) count += 1;
	}
	return count;
}

/** Hook: live unread count for the badge. */
export function useNotificationUnreadCount(): number {
	return useNotificationFeedStore(selectUnreadCount);
}

/** Append helper usable outside React (event handlers, subscriptions). */
export function addNotification(input: NotificationInput): void {
	useNotificationFeedStore.getState().add(input);
}
