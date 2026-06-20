import { describe, expect, it } from "bun:test";
import { TunnelManager } from "./tunnel";

// C6b: the relay must reassemble host → relay streaming frames
// (http:response:head / :chunk / :end) into a streaming Response the
// downstream web client can consume incrementally, while still supporting
// the legacy buffered http:response path.

type SentMessage = { type: string; [key: string]: unknown };

function makeFakeWs(sent: SentMessage[]) {
	return {
		readyState: 1,
		send: (data: string | ArrayBuffer | Uint8Array) => {
			sent.push(JSON.parse(String(data)) as SentMessage);
		},
		close: () => {},
	};
}

// handleMessage parses `String(data)` as JSON — the host always sends frames
// as JSON strings over the WS. Mirror that here so the test exercises the real
// parse path rather than passing a live object.
function deliver(manager: TunnelManager, hostId: string, frame: object) {
	manager.handleMessage(hostId, JSON.stringify(frame));
}

async function registerTunnel(manager: TunnelManager, hostId: string) {
	const sent: SentMessage[] = [];
	const ws = makeFakeWs(sent);
	// Bypass the real directory/setOnline plumbing: register writes to Upstash.
	// We test message routing only, so stub the directory-dependent register by
	// reaching through the public send paths after manually injecting a tunnel.
	// @ts-expect-error — test reaches into the private tunnels map by design.
	manager.tunnels.set(hostId, {
		hostId,
		token: "t",
		ws,
		pendingRequests: new Map(),
		activeChannels: new Map(),
		streamingResponses: new Map(),
		pingTimer: null,
		missedPings: 0,
	});
	return { sent, ws };
}

describe("TunnelManager streaming responses", () => {
	it("returns a streaming Response when the host sends head/chunk/end frames", async () => {
		const manager = new TunnelManager(5_000);
		const hostId = "org:host-a";
		const { sent } = await registerTunnel(manager, hostId);

		const responsePromise = manager.sendHttpRequest(hostId, {
			method: "GET",
			path: "/trpc/agent.stream",
			headers: {},
		});

		const reqId = sent.find((m) => m.type === "http")?.id as string;
		expect(reqId).toBeTruthy();

		deliver(manager, hostId, {
			type: "http:response:head",
			id: reqId,
			status: 200,
			headers: { "content-type": "text/event-stream" },
		});

		const res = await responsePromise;
		expect(res.status).toBe(200);
		expect(res.headers["content-type"]).toBe("text/event-stream");
		expect(res.stream).toBeInstanceOf(ReadableStream);

		deliver(manager, hostId, {
			type: "http:response:chunk",
			id: reqId,
			data: "data: 1\n\n",
		});
		deliver(manager, hostId, {
			type: "http:response:chunk",
			id: reqId,
			data: "data: 2\n\n",
		});
		deliver(manager, hostId, { type: "http:response:end", id: reqId });

		const text = await new Response(res.stream).text();
		expect(text).toBe("data: 1\n\ndata: 2\n\n");
	});

	it("still resolves a buffered response for the legacy http:response frame", async () => {
		const manager = new TunnelManager(5_000);
		const hostId = "org:host-b";
		const { sent } = await registerTunnel(manager, hostId);

		const responsePromise = manager.sendHttpRequest(hostId, {
			method: "POST",
			path: "/trpc/host.checkAccess",
			headers: {},
			body: "{}",
		});
		const reqId = sent.find((m) => m.type === "http")?.id as string;

		deliver(manager, hostId, {
			type: "http:response",
			id: reqId,
			status: 200,
			headers: { "content-type": "application/json" },
			body: '{"ok":true}',
		});

		const res = await responsePromise;
		expect(res.status).toBe(200);
		expect(res.body).toBe('{"ok":true}');
		expect(res.stream).toBeUndefined();
	});

	it("decodes base64 streaming chunks", async () => {
		const manager = new TunnelManager(5_000);
		const hostId = "org:host-c";
		const { sent } = await registerTunnel(manager, hostId);

		const responsePromise = manager.sendHttpRequest(hostId, {
			method: "GET",
			path: "/blob",
			headers: {},
		});
		const reqId = sent.find((m) => m.type === "http")?.id as string;

		deliver(manager, hostId, {
			type: "http:response:head",
			id: reqId,
			status: 200,
			headers: {},
		});
		const res = await responsePromise;
		deliver(manager, hostId, {
			type: "http:response:chunk",
			id: reqId,
			data: Buffer.from([0xde, 0xad]).toString("base64"),
			encoding: "base64",
		});
		deliver(manager, hostId, { type: "http:response:end", id: reqId });

		const bytes = new Uint8Array(await new Response(res.stream).arrayBuffer());
		expect(Array.from(bytes)).toEqual([0xde, 0xad]);
	});

	it("aborts the stream when the end frame carries an error", async () => {
		const manager = new TunnelManager(5_000);
		const hostId = "org:host-d";
		const { sent } = await registerTunnel(manager, hostId);

		const responsePromise = manager.sendHttpRequest(hostId, {
			method: "GET",
			path: "/stream",
			headers: {},
		});
		const reqId = sent.find((m) => m.type === "http")?.id as string;

		deliver(manager, hostId, {
			type: "http:response:head",
			id: reqId,
			status: 200,
			headers: {},
		});
		const res = await responsePromise;
		deliver(manager, hostId, {
			type: "http:response:chunk",
			id: reqId,
			data: "partial",
		});
		deliver(manager, hostId, {
			type: "http:response:end",
			id: reqId,
			error: "upstream reset",
		});

		await expect(new Response(res.stream).text()).rejects.toThrow();
	});
});
