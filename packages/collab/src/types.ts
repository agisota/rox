/**
 * Typed LiveBlocks configuration for Rox collaboration rooms.
 *
 * These are the shapes the app-agnostic presence surface speaks. They are kept
 * here (not declared as the LiveBlocks global `Liveblocks` augmentation) so the
 * package can be imported from both client and server bundles without forcing a
 * global type augmentation on every consumer.
 */

/** A JSON-serializable value (matches LiveBlocks' `Json`). */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

/**
 * Per-connection ephemeral presence (cursor, selection, viewing state).
 * The JSON-typed index signature keeps it assignable to LiveBlocks' `JsonObject`.
 */
export interface RoxPresence {
	/** Live cursor position in board coordinates, or null when off-board. */
	cursor: { x: number; y: number } | null;
	/** Entry id the user currently has selected, if any. */
	selectedEntryId: string | null;
	[key: string]: JsonValue | undefined;
}

/** Ephemeral CRDT scratch storage (never persisted unless promoted to Electric). */
export interface RoxStorage {
	/** Reserved for ephemeral drag-reorder scratch state. */
	draftOrder: string[];
	[key: string]: JsonValue | undefined;
}

/** Stable per-user metadata attached at room-token mint time. */
export interface RoxUserMeta {
	/** Stable user id (better-auth user id). */
	id: string;
	info: {
		name: string;
		avatarUrl: string | null;
		/** Organization the room is scoped to. */
		organizationId: string;
	};
}

/** Broadcastable room events (e.g. "ping a cursor", reactions). */
export type RoxRoomEvent =
	| { type: "ping"; entryId: string }
	| { type: "reaction"; emoji: string };

/** A presence-bearing peer, the minimal shape `PresenceStack` consumes. */
export interface RoxPresenceUser {
	connectionId: number;
	id: string;
	name: string;
	avatarUrl: string | null;
}

/**
 * Room-id factory. Rooms are org/project-scoped so membership can be enforced
 * server-side from the id alone (no separate room→org lookup needed).
 *
 *   collab dashboard room → `org:{organizationId}:dashboard:{dashboardId}`
 */
export function dashboardRoomId(
	organizationId: string,
	dashboardId: string,
): string {
	return `org:${organizationId}:dashboard:${dashboardId}`;
}

/**
 * Room-id factory for collaborative note editing (Suite P2 D7).
 *
 * Notes rooms stay org-scoped (`org:{organizationId}:note:{noteId}`) so the
 * existing id-derived `authorizeRoom` check works unchanged — only the room
 * segment differs from the dashboard convention.
 */
export function noteRoomId(organizationId: string, noteId: string): string {
	return `org:${organizationId}:note:${noteId}`;
}

/**
 * Parse the organization id back out of a room id. Returns `null` for ids that
 * do not match the `org:{orgId}:...` shape. The server uses this to verify the
 * caller's org membership matches the room they are requesting.
 */
export function organizationIdFromRoomId(roomId: string): string | null {
	const match = /^org:([^:]+):/.exec(roomId);
	return match ? (match[1] ?? null) : null;
}

/**
 * Parse the note id out of a note room id (`org:{orgId}:note:{noteId}`).
 * Returns null for any non-note room.
 */
export function noteIdFromRoomId(roomId: string): string | null {
	const match = /^org:[^:]+:note:(.+)$/.exec(roomId);
	return match ? (match[1] ?? null) : null;
}
