import { describe, expect, mock, test } from "bun:test";
import type { QueryClient } from "@tanstack/react-query";

import {
	applyCommsStreamEvent,
	type CommsStreamEvent,
	type InboxTransport,
} from "./applyCommsStreamEvent";

/**
 * MIRROR of apps/web/.../useCommsStream/applyCommsStreamEvent.test.ts — keep in
 * sync. Proves the copied routing module is behavior-identical to web.
 *
 * An `email`-transport SSE event must refresh the Mail tab (mail.*), and an
 * in-app event must refresh the chat surface (comms.*). The open thread is only
 * refreshed when the event targets it AND the open tab matches the event's
 * transport. Pure routing (no React), so it asserts exactly which query keys get
 * invalidated for each transport.
 */

const keys = {
	commsListThreads: () => ["comms", "listThreads"] as const,
	commsGetThread: ({ threadId }: { threadId: string }) =>
		["comms", "getThread", threadId] as const,
	mailListThreads: () => ["mail", "listThreads"] as const,
	mailGetThread: ({ threadId }: { threadId: string }) =>
		["mail", "getThread", threadId] as const,
	systemListThreads: () => ["system", "listThreads"] as const,
};

// NOTE: typed slightly more strictly than the web mirror because the desktop
// tsconfig typechecks `*.test.ts` (web's excludes them). The fake is a real
// `Pick<QueryClient, "invalidateQueries">`; runtime behavior is identical.
type InvalidateFilters = Parameters<QueryClient["invalidateQueries"]>[0];

function makeClient() {
	const invalidated: unknown[] = [];
	const invalidateQueries = mock((filters?: InvalidateFilters) => {
		invalidated.push(filters?.queryKey);
		return Promise.resolve();
	});
	const queryClient: Pick<QueryClient, "invalidateQueries"> = {
		invalidateQueries: invalidateQueries as QueryClient["invalidateQueries"],
	};
	return { queryClient, invalidated };
}

function event(over: Partial<CommsStreamEvent>): CommsStreamEvent {
	return {
		organizationId: "org-1",
		threadId: "thread-1",
		messageId: "msg-1",
		transport: "inapp",
		authorUserId: null,
		at: 1,
		...over,
	};
}

describe("applyCommsStreamEvent", () => {
	test("email event always invalidates mail.listThreads", () => {
		const { queryClient, invalidated } = makeClient();
		applyCommsStreamEvent(queryClient, keys, event({ transport: "email" }), {
			openThreadId: null,
			transport: "chat",
		});
		expect(invalidated).toContainEqual(["mail", "listThreads"]);
		// It must NOT touch the chat list for an email event.
		expect(invalidated).not.toContainEqual(["comms", "listThreads"]);
	});

	test("email event for the OPEN mail thread also invalidates mail.getThread", () => {
		const { queryClient, invalidated } = makeClient();
		applyCommsStreamEvent(
			queryClient,
			keys,
			event({ transport: "email", threadId: "t-open" }),
			{ openThreadId: "t-open", transport: "mail" },
		);
		expect(invalidated).toContainEqual(["mail", "listThreads"]);
		expect(invalidated).toContainEqual(["mail", "getThread", "t-open"]);
	});

	test("email event does NOT refresh getThread when the mail thread is not open", () => {
		const { queryClient, invalidated } = makeClient();
		applyCommsStreamEvent(
			queryClient,
			keys,
			event({ transport: "email", threadId: "t-other" }),
			{ openThreadId: "t-open", transport: "mail" },
		);
		expect(invalidated).toContainEqual(["mail", "listThreads"]);
		expect(invalidated).not.toContainEqual(["mail", "getThread", "t-other"]);
	});

	test("email event on the chat tab refreshes the mail list but not getThread", () => {
		const { queryClient, invalidated } = makeClient();
		applyCommsStreamEvent(
			queryClient,
			keys,
			event({ transport: "email", threadId: "t-open" }),
			{ openThreadId: "t-open", transport: "chat" },
		);
		expect(invalidated).toContainEqual(["mail", "listThreads"]);
		// The mail thread isn't "open" while the chat tab shows, so no getThread.
		expect(invalidated).not.toContainEqual(["mail", "getThread", "t-open"]);
	});

	test("inapp event invalidates comms.listThreads (not mail.*)", () => {
		const { queryClient, invalidated } = makeClient();
		applyCommsStreamEvent(queryClient, keys, event({ transport: "inapp" }), {
			openThreadId: null,
			transport: "chat",
		});
		expect(invalidated).toContainEqual(["comms", "listThreads"]);
		expect(invalidated).not.toContainEqual(["mail", "listThreads"]);
	});

	test("inapp event for the OPEN chat thread also invalidates comms.getThread", () => {
		const { queryClient, invalidated } = makeClient();
		applyCommsStreamEvent(
			queryClient,
			keys,
			event({ transport: "inapp", threadId: "c-open" }),
			{ openThreadId: "c-open", transport: "chat" },
		);
		expect(invalidated).toContainEqual(["comms", "getThread", "c-open"]);
	});

	test("a non-email transport (mesh) routes to the chat surface", () => {
		const { queryClient, invalidated } = makeClient();
		const transport: InboxTransport = "chat";
		applyCommsStreamEvent(queryClient, keys, event({ transport: "mesh" }), {
			openThreadId: null,
			transport,
		});
		expect(invalidated).toContainEqual(["comms", "listThreads"]);
		expect(invalidated).not.toContainEqual(["mail", "listThreads"]);
	});

	test("system event invalidates the system list only (no chat/mail leak)", () => {
		const { queryClient, invalidated } = makeClient();
		applyCommsStreamEvent(queryClient, keys, event({ transport: "system" }), {
			openThreadId: null,
			transport: "chat",
		});
		expect(invalidated).toContainEqual(["system", "listThreads"]);
		// Strictly invalidate-only: must NOT fall through to chat or mail.
		expect(invalidated).not.toContainEqual(["comms", "listThreads"]);
		expect(invalidated).not.toContainEqual(["mail", "listThreads"]);
	});

	test("system event never refreshes an open thread (no optimistic rows)", () => {
		const { queryClient, invalidated } = makeClient();
		applyCommsStreamEvent(
			queryClient,
			keys,
			event({ transport: "system", threadId: "sys-open" }),
			{ openThreadId: "sys-open", transport: "chat" },
		);
		expect(invalidated).toContainEqual(["system", "listThreads"]);
		expect(invalidated).not.toContainEqual(["comms", "getThread", "sys-open"]);
	});

	test("system event is a no-op when no system surface is wired", () => {
		const { queryClient, invalidated } = makeClient();
		const { systemListThreads: _omitted, ...chatMailKeys } = keys;
		applyCommsStreamEvent(
			queryClient,
			chatMailKeys,
			event({ transport: "system" }),
			{ openThreadId: null, transport: "chat" },
		);
		// Without a system surface, the event leaks nowhere — not into chat/mail.
		expect(invalidated).not.toContainEqual(["comms", "listThreads"]);
		expect(invalidated).not.toContainEqual(["mail", "listThreads"]);
		expect(invalidated).toHaveLength(0);
	});
});
