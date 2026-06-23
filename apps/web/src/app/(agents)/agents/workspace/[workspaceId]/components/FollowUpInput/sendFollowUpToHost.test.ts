import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { PromptInputMessage } from "@rox/ui/ai-elements/prompt-input";
import SuperJSON from "superjson";

// Stub the Next-runtime-coupled deps BEFORE importing the module under test so
// importing the send wiring (which pulls in `trpc/host-client`) does not pull
// in `env.ts` validation or `posthog-js`. Mirrors host-client.test.ts.
mock.module("../../../../../../../trpc/auth-token", () => ({
	getAuthToken: () => Promise.resolve("test-token"),
}));
mock.module("../../../../../../../trpc/relay-url", () => ({
	getRelayUrl: () => "https://relay.test",
}));

type FetchArgs = { url: string; init: RequestInit | undefined };

let fetchCalls: FetchArgs[] = [];
const originalFetch = globalThis.fetch;

function mockRelayOk(data: unknown): void {
	globalThis.fetch = ((url: string, init?: RequestInit) => {
		fetchCalls.push({ url, init });
		const body = { result: { data: SuperJSON.serialize(data) } };
		return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
	}) as typeof fetch;
}

function textMessage(text: string): PromptInputMessage {
	return { text, files: [] };
}

beforeEach(() => {
	fetchCalls = [];
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("sendFollowUpToHost", () => {
	it("POSTs chat.sendMessage to the host with the composed content", async () => {
		mockRelayOk({ ok: true });
		const { sendFollowUpToHost } = await import("./FollowUpInput");

		await sendFollowUpToHost(
			{ routingKey: "org:machine", workspaceId: "w1", sessionId: "s1" },
			textMessage("ship it"),
		);

		expect(fetchCalls).toHaveLength(1);
		const call = fetchCalls[0];
		expect(call?.url).toBe(
			"https://relay.test/hosts/org:machine/trpc/chat.sendMessage",
		);
		expect(call?.init?.method).toBe("POST");
		expect((call?.init?.headers as Record<string, string>)?.authorization).toBe(
			"Bearer test-token",
		);
		const decoded = SuperJSON.deserialize(
			JSON.parse(call?.init?.body as string),
		) as Record<string, unknown>;
		expect(decoded).toEqual({
			sessionId: "s1",
			workspaceId: "w1",
			payload: { content: "ship it", files: undefined },
		});
	});

	it("maps composer file attachments into the host payload", async () => {
		mockRelayOk({ ok: true });
		const { sendFollowUpToHost } = await import("./FollowUpInput");

		await sendFollowUpToHost(
			{ routingKey: "org:machine", workspaceId: "w1", sessionId: "s1" },
			{
				text: "see attached",
				files: [
					{
						type: "file",
						mediaType: "image/png",
						filename: "a.png",
						url: "data:image/png;base64,QUJD",
					},
				],
			},
		);

		const decoded = SuperJSON.deserialize(
			JSON.parse(fetchCalls[0]?.init?.body as string),
		) as { payload: { files: unknown } };
		expect(decoded.payload.files).toEqual([
			{ data: "QUJD", mediaType: "image/png", filename: "a.png" },
		]);
	});

	it("rejects (does not swallow) when the host write fails — composer can restore the draft", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(new Response("nope", { status: 502 }))) as typeof fetch;
		const { sendFollowUpToHost } = await import("./FollowUpInput");

		await expect(
			sendFollowUpToHost(
				{ routingKey: "org:machine", workspaceId: "w1", sessionId: "s1" },
				textMessage("will fail"),
			),
		).rejects.toThrow("502");
	});
});
