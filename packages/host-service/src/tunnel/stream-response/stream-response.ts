import { getErrorMessage } from "@rox/shared/error";
import type { TunnelResponse } from "../types";

/**
 * Decide whether an upstream response should be streamed through the tunnel
 * (head + chunk* + end frames) or buffered into a single http:response frame.
 *
 * We stream when the upstream is a Server-Sent Events stream or otherwise has
 * no declared content-length (chunked / open-ended) — i.e. exactly the cases
 * where buffering with `await response.text()` would stall the consumer until
 * the upstream finishes (agent run streams, chat completions). Plain JSON tRPC
 * calls carry a content-length and stay on the cheaper buffered path.
 */
export function shouldStream(headers: Headers): boolean {
	const contentType = headers.get("content-type") ?? "";
	if (contentType.includes("text/event-stream")) return true;
	const transferEncoding = headers.get("transfer-encoding") ?? "";
	if (transferEncoding.toLowerCase().includes("chunked")) return true;
	if (headers.get("content-length") === null) return true;
	return false;
}

export function headersToRecord(headers: Headers): Record<string, string> {
	const record: Record<string, string> = {};
	for (const [key, value] of headers.entries()) {
		record[key] = value;
	}
	return record;
}

interface StreamableResponse {
	status: number;
	headers: Headers;
	body: ReadableStream<Uint8Array> | null;
	text: () => Promise<string>;
}

/**
 * Forward an upstream response to the relay as tunnel frames. Buffered
 * responses become a single `http:response`; streaming responses become a
 * `http:response:head`, then one `http:response:chunk` per body chunk, then a
 * terminating `http:response:end` (carrying an error if the body read fails
 * mid-stream). The `id` correlates every frame to the originating request.
 */
export async function forwardResponse(
	id: string,
	response: StreamableResponse,
	send: (message: TunnelResponse) => void,
): Promise<void> {
	const headers = headersToRecord(response.headers);

	if (!shouldStream(response.headers) || !response.body) {
		const body = await response.text();
		send({ type: "http:response", id, status: response.status, headers, body });
		return;
	}

	send({ type: "http:response:head", id, status: response.status, headers });

	const reader = response.body.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value && value.length > 0) {
				send({
					type: "http:response:chunk",
					id,
					data: Buffer.from(value).toString("base64"),
					encoding: "base64",
				});
			}
		}
		send({ type: "http:response:end", id });
	} catch (error) {
		send({ type: "http:response:end", id, error: getErrorMessage(error) });
	} finally {
		reader.releaseLock();
	}
}
