import { describe, expect, test } from "bun:test";
import { type CommsRealtimeEvent, decideRefetch } from "./decideRefetch";

function event(over: Partial<CommsRealtimeEvent> = {}): CommsRealtimeEvent {
	return {
		organizationId: "org-1",
		threadId: "thread-1",
		messageId: "msg-1",
		transport: "inapp",
		authorUserId: "user-1",
		at: 1,
		...over,
	};
}

describe("decideRefetch", () => {
	test("in-app event on the open thread refreshes threads + the open thread", () => {
		expect(
			decideRefetch(event({ threadId: "thread-1" }), {
				openThreadId: "thread-1",
			}),
		).toEqual({ refreshThreads: true, refreshOpenThread: true });
	});

	test("in-app event on a different thread refreshes threads only", () => {
		expect(
			decideRefetch(event({ threadId: "thread-2" }), {
				openThreadId: "thread-1",
			}),
		).toEqual({ refreshThreads: true, refreshOpenThread: false });
	});

	test("email transport refreshes threads only (chat tab never refreshes a mail thread)", () => {
		expect(
			decideRefetch(event({ transport: "email", threadId: "thread-1" }), {
				openThreadId: "thread-1",
			}),
		).toEqual({ refreshThreads: true, refreshOpenThread: false });
	});

	test("missing/empty threadId never refreshes the open thread", () => {
		expect(
			decideRefetch(event({ threadId: "" }), { openThreadId: "" }),
		).toEqual({ refreshThreads: true, refreshOpenThread: false });
	});

	test("no thread open never refreshes the open thread", () => {
		expect(
			decideRefetch(event({ threadId: "thread-1" }), { openThreadId: null }),
		).toEqual({ refreshThreads: true, refreshOpenThread: false });
	});
});
