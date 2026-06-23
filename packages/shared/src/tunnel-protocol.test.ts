import { describe, expect, it } from "bun:test";
import type {
	TunnelHttpResponse,
	TunnelHttpResponseChunk,
	TunnelHttpResponseEnd,
	TunnelHttpResponseHead,
	TunnelRequest,
	TunnelResponse,
} from "./tunnel-protocol";

// These tests are purely structural/type-level. They lock the streaming
// pass-through wire contract (C6a) so the relay (C6b) and host (C6c) implement
// against a frozen message shape: a head frame, N chunk frames, and a
// terminating end frame, all correlated by the original request `id`.

describe("tunnel-protocol streaming response frames", () => {
	it("models a streaming head frame distinct from the buffered http:response", () => {
		const head: TunnelHttpResponseHead = {
			type: "http:response:head",
			id: "req-1",
			status: 200,
			headers: { "content-type": "text/event-stream" },
		};
		expect(head.type).toBe("http:response:head");
		expect(head.id).toBe("req-1");
		expect(head.status).toBe(200);
		// A streaming head must NOT carry a body — body arrives via chunks.
		expect("body" in head).toBe(false);
	});

	it("models chunk frames carrying utf-8 or base64-encoded payloads", () => {
		const textChunk: TunnelHttpResponseChunk = {
			type: "http:response:chunk",
			id: "req-1",
			data: "data: hello\n\n",
		};
		const binaryChunk: TunnelHttpResponseChunk = {
			type: "http:response:chunk",
			id: "req-1",
			data: Buffer.from([0x00, 0x01]).toString("base64"),
			encoding: "base64",
		};
		expect(textChunk.encoding).toBeUndefined();
		expect(binaryChunk.encoding).toBe("base64");
		expect(textChunk.id).toBe(binaryChunk.id);
	});

	it("models an end frame, optionally signaling an error", () => {
		const ok: TunnelHttpResponseEnd = {
			type: "http:response:end",
			id: "req-1",
		};
		const failed: TunnelHttpResponseEnd = {
			type: "http:response:end",
			id: "req-1",
			error: "upstream reset",
		};
		expect(ok.error).toBeUndefined();
		expect(failed.error).toBe("upstream reset");
	});

	it("includes streaming frames in the TunnelResponse union (host → relay)", () => {
		const frames: TunnelResponse[] = [
			{ type: "http:response", id: "a", status: 200, headers: {} },
			{ type: "http:response:head", id: "b", status: 200, headers: {} },
			{ type: "http:response:chunk", id: "b", data: "x" },
			{ type: "http:response:end", id: "b" },
			{ type: "pong" },
		];
		// Every frame is assignable to TunnelResponse — compile-time guarantee;
		// the runtime assertion just confirms the array was constructed.
		expect(frames).toHaveLength(5);
	});

	it("keeps the request union (relay → host) backward compatible", () => {
		const req: TunnelRequest = {
			type: "http",
			id: "a",
			method: "GET",
			path: "/",
			headers: {},
		};
		expect(req.type).toBe("http");
	});

	it("preserves the legacy buffered http:response shape unchanged", () => {
		const buffered: TunnelHttpResponse = {
			type: "http:response",
			id: "req-1",
			status: 204,
			headers: {},
			body: undefined,
		};
		expect(buffered.type).toBe("http:response");
	});
});
