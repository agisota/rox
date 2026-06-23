import { afterEach, describe, expect, mock, test } from "bun:test";
import type { QueryClient } from "@tanstack/react-query";

import {
	applyCommsStreamEvent,
	type CommsStreamEvent,
	type CommsStreamQueryKeys,
} from "../applyCommsStreamEvent";
import { consumeCommsStream } from "./consumeCommsStream";

/**
 * Unit tests for the desktop fetch+SSE reader. We test the pure
 * {@link consumeCommsStream} reader directly (the `useCommsStream` hook wraps it
 * in a `useEffect` + backoff loop, which is not exercisable in `bun:test` — no
 * happy-dom render env, and adding one is out of scope). The reader lives in its
 * own module precisely so it imports no React/tRPC/electron graph and is unit-
 * testable. It carries every behavior that differs from web's cookie
 * `EventSource`: the `Authorization: Bearer` header, the manual `\n\n` frame
 * parsing, comment-skipping and malformed-frame tolerance.
 *
 * No real network: `global.fetch` is mocked to return a `Response` whose body is
 * a `ReadableStream` of encoded SSE bytes (mirroring the api route's
 * `: connected` / `event: message` / `: ping` frames).
 */

const TOKEN = "test-bearer-token";

// The same query-key factories the web test uses (makeClient()-style), so a
// routed event invalidates a stable, assertable key.
const keys: CommsStreamQueryKeys = {
	commsListThreads: () => ["comms", "listThreads"] as const,
	commsGetThread: ({ threadId }) => ["comms", "getThread", threadId] as const,
	mailListThreads: () => ["mail", "listThreads"] as const,
	mailGetThread: ({ threadId }) => ["mail", "getThread", threadId] as const,
};

type InvalidateFilters = Parameters<QueryClient["invalidateQueries"]>[0];

function makeClient() {
	const invalidated: unknown[] = [];
	const invalidateQueries = mock((filters?: InvalidateFilters) => {
		invalidated.push(filters?.queryKey);
		return Promise.resolve();
	});
	// Structurally a `Pick<QueryClient, "invalidateQueries">` — the only method
	// `applyCommsStreamEvent` touches — so it's accepted without a real client.
	const queryClient: Pick<QueryClient, "invalidateQueries"> = {
		invalidateQueries: invalidateQueries as QueryClient["invalidateQueries"],
	};
	return { queryClient, invalidated, invalidateQueries };
}

/** Build a Response whose body streams the given SSE chunks (encoded). */
function sseResponse(chunks: string[]): Response {
	const encoder = new TextEncoder();
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
	return new Response(body, {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

const emailEvent: CommsStreamEvent = {
	organizationId: "org-1",
	threadId: "t-1",
	messageId: "m-1",
	transport: "email",
	authorUserId: null,
	at: 1,
};

const originalFetch = global.fetch;

afterEach(() => {
	global.fetch = originalFetch;
});

describe("consumeCommsStream", () => {
	test("sends Authorization: Bearer <token> and ignores comment frames", async () => {
		let capturedHeaders: Headers | undefined;
		global.fetch = mock((_url: string, init?: RequestInit) => {
			capturedHeaders = new Headers(init?.headers);
			return Promise.resolve(
				sseResponse([
					": connected\n\n",
					`event: message\ndata: ${JSON.stringify(emailEvent)}\n\n`,
				]),
			);
		}) as unknown as typeof fetch;

		const { queryClient, invalidated } = makeClient();
		await consumeCommsStream({
			url: "https://api.test/api/comms/stream",
			token: TOKEN,
			signal: new AbortController().signal,
			onEvent: (event) =>
				applyCommsStreamEvent(queryClient, keys, event, {
					openThreadId: null,
					transport: "chat",
				}),
		});

		expect(capturedHeaders?.get("Authorization")).toBe(`Bearer ${TOKEN}`);
		// `: connected` is a comment and must not produce an event.
		expect(invalidated).toEqual([["mail", "listThreads"]]);
	});

	test("parses an email frame and routes it to mail.listThreads", async () => {
		global.fetch = mock(() =>
			Promise.resolve(
				sseResponse([
					`event: message\ndata: ${JSON.stringify(emailEvent)}\n\n`,
				]),
			),
		) as unknown as typeof fetch;

		const { queryClient, invalidated } = makeClient();
		await consumeCommsStream({
			url: "https://api.test/api/comms/stream",
			token: TOKEN,
			signal: new AbortController().signal,
			onEvent: (event) =>
				applyCommsStreamEvent(queryClient, keys, event, {
					openThreadId: null,
					transport: "mail",
				}),
		});

		expect(invalidated).toContainEqual(["mail", "listThreads"]);
	});

	test("ignores `: ping` heartbeats", async () => {
		global.fetch = mock(() =>
			Promise.resolve(sseResponse([": ping\n\n", ": ping\n\n"])),
		) as unknown as typeof fetch;

		const { queryClient, invalidated, invalidateQueries } = makeClient();
		await consumeCommsStream({
			url: "https://api.test/api/comms/stream",
			token: TOKEN,
			signal: new AbortController().signal,
			onEvent: (event) =>
				applyCommsStreamEvent(queryClient, keys, event, {
					openThreadId: null,
					transport: "chat",
				}),
		});

		expect(invalidated).toEqual([]);
		expect(invalidateQueries).not.toHaveBeenCalled();
	});

	test("a malformed data line does not throw and is skipped", async () => {
		global.fetch = mock(() =>
			Promise.resolve(
				sseResponse([
					"event: message\ndata: {not json}\n\n",
					`event: message\ndata: ${JSON.stringify(emailEvent)}\n\n`,
				]),
			),
		) as unknown as typeof fetch;

		const { queryClient, invalidated } = makeClient();
		// Must not reject on the malformed frame; the valid frame still routes.
		await consumeCommsStream({
			url: "https://api.test/api/comms/stream",
			token: TOKEN,
			signal: new AbortController().signal,
			onEvent: (event) =>
				applyCommsStreamEvent(queryClient, keys, event, {
					openThreadId: null,
					transport: "chat",
				}),
		});

		expect(invalidated).toEqual([["mail", "listThreads"]]);
	});

	test("handles a frame split across two chunks (buffering)", async () => {
		const frame = `event: message\ndata: ${JSON.stringify(emailEvent)}\n\n`;
		const mid = Math.floor(frame.length / 2);
		global.fetch = mock(() =>
			Promise.resolve(sseResponse([frame.slice(0, mid), frame.slice(mid)])),
		) as unknown as typeof fetch;

		const { queryClient, invalidated } = makeClient();
		await consumeCommsStream({
			url: "https://api.test/api/comms/stream",
			token: TOKEN,
			signal: new AbortController().signal,
			onEvent: (event) =>
				applyCommsStreamEvent(queryClient, keys, event, {
					openThreadId: null,
					transport: "chat",
				}),
		});

		expect(invalidated).toContainEqual(["mail", "listThreads"]);
	});

	test("returns without fetching when the abort signal is already aborted", async () => {
		const fetchMock = mock(() => Promise.resolve(sseResponse([])));
		global.fetch = fetchMock as unknown as typeof fetch;

		const controller = new AbortController();
		controller.abort();
		await consumeCommsStream({
			url: "https://api.test/api/comms/stream",
			token: TOKEN,
			signal: controller.signal,
			onEvent: () => {},
		});

		expect(fetchMock).not.toHaveBeenCalled();
	});
});
