/**
 * Durable persistence for desktop "dev chat" sessions.
 *
 * Why this module exists
 * ----------------------
 * When the desktop app runs in dev-chat mode (`SKIP_ENV_VALIDATION` truthy, see
 * `dev-chat.ts`), there is no real organization or auth, so chat sessions are
 * never written to the cloud Postgres `chat_sessions` table and therefore never
 * sync down through Electric into the persisted `chatSessions` collection that
 * the chat sidebar reads.
 *
 * Previously the dev-mode session lived only as ephemeral in-memory React state
 * (a synthetic list entry prepended on render). On app quit that state was
 * dropped, and on relaunch the Electric-backed list was empty for the mock org,
 * so every prior chat appeared deleted. That is the chat data-loss-on-quit bug.
 *
 * The fix records the dev-chat session index in a durable client-owned
 * key/value store (the renderer's on-disk `localStorage`, the same mechanism the
 * app already relies on for `v2UserPreferences`, sidebar state, etc.). Because
 * the store is local-only it is NOT reconciled against the Electric stream, so a
 * never-synced dev row is not dropped on the next full reload. The session list
 * is rebuilt from this store on launch, so dev chats persist across restarts.
 *
 * This path is dev-only: every caller gates on `isDesktopChatDevMode()`, so
 * production chat behavior (cloud Postgres + Electric) is completely untouched.
 */

/**
 * Minimal synchronous key/value store contract. Backed by the renderer's
 * `localStorage` at runtime; injectable in tests so a simulated quit+relaunch
 * can be exercised without a DOM or a full app boot.
 */
export interface DevChatKeyValueStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface DevChatSessionRecord {
	sessionId: string;
	v2WorkspaceId: string;
	title: string;
	/** Epoch milliseconds. Stored as a number so the index is JSON-stable. */
	createdAt: number;
	/** Epoch milliseconds; drives the "most recent first" ordering. */
	lastActiveAt: number;
}

const STORAGE_KEY = "rox.dev-chat-sessions.v1";

function resolveDefaultStore(): DevChatKeyValueStore | null {
	// `globalThis.localStorage` exists in the Electron renderer and in the Bun
	// test runtime, but not in the Electron main process. Returning null there
	// makes the store a safe no-op rather than throwing.
	const candidate = (
		globalThis as { localStorage?: DevChatKeyValueStore | undefined }
	).localStorage;
	return candidate ?? null;
}

function isDevChatSessionRecord(value: unknown): value is DevChatSessionRecord {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.sessionId === "string" &&
		typeof record.v2WorkspaceId === "string" &&
		typeof record.title === "string" &&
		typeof record.createdAt === "number" &&
		Number.isFinite(record.createdAt) &&
		typeof record.lastActiveAt === "number" &&
		Number.isFinite(record.lastActiveAt)
	);
}

/**
 * Pure decode: parse persisted JSON into a validated record map. Tolerant of
 * absent/corrupt storage (returns an empty map) so a bad write can never wipe or
 * crash the chat list — it just falls back to "no dev sessions yet".
 */
export function parseDevChatSessions(
	raw: string | null,
): Map<string, DevChatSessionRecord> {
	const sessions = new Map<string, DevChatSessionRecord>();
	if (!raw) return sessions;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return sessions;
	}
	if (!Array.isArray(parsed)) return sessions;

	for (const entry of parsed) {
		if (isDevChatSessionRecord(entry)) {
			sessions.set(entry.sessionId, entry);
		}
	}
	return sessions;
}

/** Pure encode: serialize the record map to the persisted JSON string. */
export function serializeDevChatSessions(
	sessions: Map<string, DevChatSessionRecord>,
): string {
	return JSON.stringify([...sessions.values()]);
}

/**
 * Pure upsert used by both the runtime store and the regression test. Inserting
 * a session that already exists refreshes `lastActiveAt`/`title` but preserves
 * the original `createdAt`, so re-activating a chat never loses its identity.
 */
export function upsertDevChatSession(
	sessions: Map<string, DevChatSessionRecord>,
	input: {
		sessionId: string;
		v2WorkspaceId: string;
		title?: string;
		now: number;
	},
): Map<string, DevChatSessionRecord> {
	const next = new Map(sessions);
	const existing = next.get(input.sessionId);
	next.set(input.sessionId, {
		sessionId: input.sessionId,
		v2WorkspaceId: input.v2WorkspaceId,
		title: input.title ?? existing?.title ?? "",
		createdAt: existing?.createdAt ?? input.now,
		lastActiveAt: input.now,
	});
	return next;
}

/**
 * Durable dev-chat-session index over a {@link DevChatKeyValueStore}.
 *
 * A fresh `DevChatSessionStore` constructed over the SAME underlying store after
 * a restart reads back every previously persisted session — that is the property
 * the regression test asserts to prove chats survive quit+relaunch.
 */
export class DevChatSessionStore {
	private readonly store: DevChatKeyValueStore | null;
	private readonly storageKey: string;

	constructor(
		store: DevChatKeyValueStore | null = resolveDefaultStore(),
		storageKey: string = STORAGE_KEY,
	) {
		this.store = store;
		this.storageKey = storageKey;
	}

	/** Whether a durable backing store is available (false in the main process). */
	get isPersistent(): boolean {
		return this.store !== null;
	}

	private read(): Map<string, DevChatSessionRecord> {
		if (!this.store) return new Map();
		return parseDevChatSessions(this.store.getItem(this.storageKey));
	}

	private write(sessions: Map<string, DevChatSessionRecord>): void {
		if (!this.store) return;
		this.store.setItem(this.storageKey, serializeDevChatSessions(sessions));
	}

	/**
	 * Persist (insert or refresh) a dev-chat session. This is what makes a dev
	 * chat durable across an app quit. Idempotent on `sessionId`.
	 */
	upsert(input: {
		sessionId: string;
		v2WorkspaceId: string;
		title?: string;
		now?: number;
	}): DevChatSessionRecord {
		const now = input.now ?? Date.now();
		const next = upsertDevChatSession(this.read(), {
			sessionId: input.sessionId,
			v2WorkspaceId: input.v2WorkspaceId,
			title: input.title,
			now,
		});
		this.write(next);
		const record = next.get(input.sessionId);
		if (!record) {
			// Unreachable: upsert always sets the key. Guard keeps the return total.
			throw new Error("Failed to persist dev chat session");
		}
		return record;
	}

	/** Remove a dev-chat session (mirrors the user-initiated delete path). */
	remove(sessionId: string): void {
		const sessions = this.read();
		if (!sessions.delete(sessionId)) return;
		this.write(sessions);
	}

	/**
	 * All persisted sessions for a workspace, most-recently-active first. This is
	 * the durable replacement for the old ephemeral in-memory session list.
	 */
	listByWorkspace(v2WorkspaceId: string): DevChatSessionRecord[] {
		return [...this.read().values()]
			.filter((session) => session.v2WorkspaceId === v2WorkspaceId)
			.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
	}
}
