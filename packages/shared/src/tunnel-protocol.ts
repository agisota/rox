// ── Relay → Host ────────────────────────────────────────────────────

export interface TunnelHttpRequest {
	type: "http";
	id: string;
	method: string;
	path: string;
	headers: Record<string, string>;
	body?: string;
}

export interface TunnelWsOpen {
	type: "ws:open";
	id: string;
	path: string;
	query?: string;
}

export interface TunnelWsFrame {
	type: "ws:frame";
	id: string;
	data: string;
	encoding?: "base64";
}

export interface TunnelWsClose {
	type: "ws:close";
	id: string;
	code?: number;
}

export interface TunnelPing {
	type: "ping";
}

// In-band drain signal — relay sends this to every tunnel right before
// SIGINT-triggered shutdown so the host knows to reconnect immediately
// rather than waiting for the WS close frame (which doesn't reliably
// reach the host within the kill_timeout window) or the host-side
// inactivity watchdog.
export interface TunnelDrain {
	type: "drain";
	reason?: string;
}

export type TunnelRequest =
	| TunnelHttpRequest
	| TunnelWsOpen
	| TunnelWsFrame
	| TunnelWsClose
	| TunnelPing
	| TunnelDrain;

// ── Host → Relay ────────────────────────────────────────────────────

export interface TunnelHttpResponse {
	type: "http:response";
	id: string;
	status: number;
	headers: Record<string, string>;
	body?: string;
}

export interface TunnelPong {
	type: "pong";
}

// ── Streaming HTTP response (C6) ─────────────────────────────────────
//
// The buffered `TunnelHttpResponse` above carries the entire body in one
// frame — fine for ordinary JSON tRPC calls, but it stalls Server-Sent
// Events / chunked responses (agent run streams, chat completions) until
// the upstream finishes, defeating the point of streaming. The three
// frames below let the host forward an upstream body incrementally:
//
//   http:response:head   — status + headers, sent once when the upstream
//                          response begins; no body.
//   http:response:chunk  — one slice of the body; many per response.
//   http:response:end    — terminates the stream (optionally with an
//                          error if the upstream/proxy failed mid-stream).
//
// All three correlate to the originating request by `id`, exactly like the
// buffered path. The buffered `http:response` is still used for non-stream
// responses, so this is purely additive and backward compatible.
export interface TunnelHttpResponseHead {
	type: "http:response:head";
	id: string;
	status: number;
	headers: Record<string, string>;
}

export interface TunnelHttpResponseChunk {
	type: "http:response:chunk";
	id: string;
	data: string;
	encoding?: "base64";
}

export interface TunnelHttpResponseEnd {
	type: "http:response:end";
	id: string;
	error?: string;
}

export type TunnelResponse =
	| TunnelHttpResponse
	| TunnelHttpResponseHead
	| TunnelHttpResponseChunk
	| TunnelHttpResponseEnd
	| TunnelWsFrame
	| TunnelWsClose
	| TunnelPong;
