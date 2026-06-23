import type { CommsStreamEvent } from "../applyCommsStreamEvent";

/**
 * The pure fetch+SSE reader behind {@link useCommsStream}. Kept in its own
 * module — free of React, env, tRPC and Electron-IPC imports — so the wire
 * parsing (bearer header, `\n\n` frame buffering, `:`-comment skipping,
 * malformed-frame tolerance) is unit-testable in `bun:test` without booting the
 * renderer's tRPC/electron client graph.
 *
 * WHY `fetch` AND NOT `EventSource` (read before "simplifying" to match web):
 * the renderer runs at origin `rox://app` and authenticates to the API with a
 * BEARER token only (no usable cross-scheme cookie). `/api/comms/stream` is
 * header-gated, and native `EventSource` CANNOT set an `Authorization` header —
 * it would silently 401. So the consumer is `fetch()` + a `ReadableStream`
 * reader that sends `Authorization: Bearer`. Do NOT switch to `EventSource`, and
 * do NOT add a `?token=` query param (needless server change; leaks the token).
 */

export interface ConsumeCommsStreamArgs {
	/** The `/api/comms/stream` URL. */
	url: string;
	/** Bearer token for the `Authorization` header. */
	token: string;
	/** Abort signal; when aborted the fetch/reader tears down. */
	signal: AbortSignal;
	/** Called once per parsed SSE `message` frame. */
	onEvent: (event: CommsStreamEvent) => void;
}

/**
 * Open the comms SSE stream over `fetch` and route each `message` frame to
 * `onEvent`. Resolves when the response body ends (clean close) or the signal
 * aborts; the caller decides whether to reconnect. Rejects only on a
 * transport/`fetch` error (a malformed `data:` line is swallowed, not thrown).
 */
export async function consumeCommsStream({
	url,
	token,
	signal,
	onEvent,
}: ConsumeCommsStreamArgs): Promise<void> {
	if (signal.aborted) return;

	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` },
		signal,
	});

	const body = response.body;
	if (!body) return;

	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// SSE frames are delimited by a blank line. Consume only COMPLETE
			// frames and leave any trailing partial in the buffer (frames can split
			// across chunks).
			let separator = buffer.indexOf("\n\n");
			while (separator !== -1) {
				const frame = buffer.slice(0, separator);
				buffer = buffer.slice(separator + 2);
				dispatchFrame(frame, onEvent);
				separator = buffer.indexOf("\n\n");
			}
		}
	} finally {
		// Always release the lock so a reconnect can re-acquire the body.
		reader.cancel().catch(() => {});
	}
}

/** Parse one raw SSE frame and, if it carries a JSON event, hand it to `onEvent`. */
function dispatchFrame(
	frame: string,
	onEvent: (event: CommsStreamEvent) => void,
): void {
	const dataLines: string[] = [];
	for (const line of frame.split("\n")) {
		// Skip comment lines (`: connected`, `: ping`) and non-data fields.
		if (line.startsWith(":")) continue;
		if (line.startsWith("data:")) {
			dataLines.push(line.slice(5).trimStart());
		}
	}
	if (dataLines.length === 0) return;

	const data = dataLines.join("\n");
	let event: CommsStreamEvent;
	try {
		event = JSON.parse(data) as CommsStreamEvent;
	} catch {
		// A malformed payload must not crash the reader (mirror web's try/catch).
		return;
	}
	onEvent(event);
}
