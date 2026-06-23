import { describe, expect, it } from "bun:test";
import {
	type DevChatKeyValueStore,
	DevChatSessionStore,
	parseDevChatSessions,
	serializeDevChatSessions,
	upsertDevChatSession,
} from "./dev-chat-store";

/**
 * In-memory key/value store that survives across `DevChatSessionStore`
 * instances, exactly like the renderer's on-disk `localStorage` survives an app
 * quit. Constructing a fresh `DevChatSessionStore` over the same instance models
 * a relaunch reading back the previously persisted data.
 */
function createPersistentStore(): DevChatKeyValueStore {
	const map = new Map<string, string>();
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => {
			map.set(key, value);
		},
		removeItem: (key) => {
			map.delete(key);
		},
	};
}

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

describe("DevChatSessionStore — chat persistence across quit+relaunch", () => {
	it("keeps a dev chat session after a simulated quit and relaunch (regression: chats wiped on quit)", () => {
		// Durable backing store, shared across the two app "lifetimes".
		const backing = createPersistentStore();

		// --- App run #1: user starts a chat, then quits. ---
		const beforeQuit = new DevChatSessionStore(backing);
		beforeQuit.upsert({
			sessionId: "session-keep-me",
			v2WorkspaceId: WORKSPACE_ID,
			title: "My important chat",
			now: 1000,
		});

		// Sanity: the session is visible while the app is running.
		expect(
			beforeQuit.listByWorkspace(WORKSPACE_ID).map((s) => s.sessionId),
		).toEqual(["session-keep-me"]);

		// --- App quit + relaunch: a brand-new store over the SAME on-disk data. ---
		const afterRelaunch = new DevChatSessionStore(backing);
		const restored = afterRelaunch.listByWorkspace(WORKSPACE_ID);

		// The previously created chat MUST still be present — this is the bug
		// that shipped: chats were gone after quitting and reopening the app.
		expect(restored).toHaveLength(1);
		expect(restored[0]?.sessionId).toBe("session-keep-me");
		expect(restored[0]?.title).toBe("My important chat");
		expect(restored[0]?.createdAt).toBe(1000);
	});

	it("persists multiple sessions and restores them most-recently-active first", () => {
		const backing = createPersistentStore();
		const run1 = new DevChatSessionStore(backing);
		run1.upsert({
			sessionId: "older",
			v2WorkspaceId: WORKSPACE_ID,
			now: 1000,
		});
		run1.upsert({
			sessionId: "newer",
			v2WorkspaceId: WORKSPACE_ID,
			now: 5000,
		});

		const run2 = new DevChatSessionStore(backing);
		expect(run2.listByWorkspace(WORKSPACE_ID).map((s) => s.sessionId)).toEqual([
			"newer",
			"older",
		]);
	});

	it("scopes restored sessions to the requested workspace", () => {
		const backing = createPersistentStore();
		const run1 = new DevChatSessionStore(backing);
		run1.upsert({ sessionId: "a", v2WorkspaceId: WORKSPACE_ID, now: 1 });
		run1.upsert({
			sessionId: "b",
			v2WorkspaceId: "22222222-2222-4222-8222-222222222222",
			now: 2,
		});

		const run2 = new DevChatSessionStore(backing);
		expect(run2.listByWorkspace(WORKSPACE_ID).map((s) => s.sessionId)).toEqual([
			"a",
		]);
	});

	it("re-activating a session refreshes lastActiveAt but preserves createdAt and identity", () => {
		const backing = createPersistentStore();
		const run1 = new DevChatSessionStore(backing);
		run1.upsert({
			sessionId: "s1",
			v2WorkspaceId: WORKSPACE_ID,
			title: "first",
			now: 1000,
		});
		run1.upsert({
			sessionId: "s1",
			v2WorkspaceId: WORKSPACE_ID,
			title: "renamed",
			now: 9000,
		});

		const run2 = new DevChatSessionStore(backing);
		const sessions = run2.listByWorkspace(WORKSPACE_ID);
		expect(sessions).toHaveLength(1);
		expect(sessions[0]?.createdAt).toBe(1000);
		expect(sessions[0]?.lastActiveAt).toBe(9000);
		expect(sessions[0]?.title).toBe("renamed");
	});

	it("removes a session durably (deleted chats stay deleted after relaunch)", () => {
		const backing = createPersistentStore();
		const run1 = new DevChatSessionStore(backing);
		run1.upsert({ sessionId: "keep", v2WorkspaceId: WORKSPACE_ID, now: 1 });
		run1.upsert({ sessionId: "drop", v2WorkspaceId: WORKSPACE_ID, now: 2 });
		run1.remove("drop");

		const run2 = new DevChatSessionStore(backing);
		expect(run2.listByWorkspace(WORKSPACE_ID).map((s) => s.sessionId)).toEqual([
			"keep",
		]);
	});

	it("is a safe no-op when no durable store is available (e.g. main process)", () => {
		const store = new DevChatSessionStore(null);
		expect(store.isPersistent).toBe(false);
		expect(() =>
			store.upsert({ sessionId: "x", v2WorkspaceId: WORKSPACE_ID }),
		).not.toThrow();
		// Without a backing store nothing is retained, but it must not crash the
		// chat UI on a platform that lacks localStorage.
		expect(store.listByWorkspace(WORKSPACE_ID)).toEqual([]);
	});

	it("tolerates corrupt persisted data without throwing or wiping behavior", () => {
		const backing = createPersistentStore();
		backing.setItem("rox.dev-chat-sessions.v1", "{not valid json");
		const store = new DevChatSessionStore(backing);
		expect(store.listByWorkspace(WORKSPACE_ID)).toEqual([]);
		// A subsequent write recovers cleanly.
		store.upsert({ sessionId: "fresh", v2WorkspaceId: WORKSPACE_ID, now: 1 });
		const reopened = new DevChatSessionStore(backing);
		expect(
			reopened.listByWorkspace(WORKSPACE_ID).map((s) => s.sessionId),
		).toEqual(["fresh"]);
	});
});

describe("dev chat store pure helpers", () => {
	it("round-trips through serialize/parse", () => {
		const sessions = upsertDevChatSession(new Map(), {
			sessionId: "s1",
			v2WorkspaceId: WORKSPACE_ID,
			title: "hello",
			now: 42,
		});
		const restored = parseDevChatSessions(serializeDevChatSessions(sessions));
		expect(restored.get("s1")).toEqual({
			sessionId: "s1",
			v2WorkspaceId: WORKSPACE_ID,
			title: "hello",
			createdAt: 42,
			lastActiveAt: 42,
		});
	});

	it("parse returns empty map for null/garbage input", () => {
		expect(parseDevChatSessions(null).size).toBe(0);
		expect(parseDevChatSessions("null").size).toBe(0);
		expect(parseDevChatSessions('{"not":"array"}').size).toBe(0);
		expect(parseDevChatSessions('[{"sessionId":123}]').size).toBe(0);
	});
});
