/**
 * NDJSON Message Framing
 *
 * Pure (socket-free) helpers for the terminal host wire protocol:
 * - `NdjsonParser` splits an incoming string stream into newline-delimited
 *   JSON messages, buffering partial frames across chunks.
 * - `serializeMessage` serializes an outgoing message to a single NDJSON line.
 *
 * This module has no socket/process/IO dependencies so it can be unit tested
 * in isolation.
 */

import { logger } from "main/lib/logger";
import type { IpcEvent, IpcResponse } from "./types";

/**
 * Incremental NDJSON parser.
 *
 * Feed raw string chunks via `parse`; it returns every complete
 * newline-delimited JSON message decoded so far, retaining any trailing
 * partial frame for the next call. Empty/whitespace-only lines are ignored,
 * and lines that fail to parse as JSON are skipped (with a warning) rather
 * than throwing.
 */
export class NdjsonParser {
	private remainder = "";

	parse(chunk: string): Array<IpcResponse | IpcEvent> {
		const messages: Array<IpcResponse | IpcEvent> = [];

		// Prepend any remainder from previous parse
		const data = this.remainder + chunk;
		this.remainder = "";

		let startIndex = 0;
		let newlineIndex = data.indexOf("\n");

		while (newlineIndex !== -1) {
			// Strip a trailing CR so CRLF-framed lines from the daemon parse
			// cleanly (a lone "\r" left on the line breaks JSON.parse).
			let lineEnd = newlineIndex;
			if (lineEnd > startIndex && data.charCodeAt(lineEnd - 1) === 13) {
				lineEnd -= 1;
			}
			const line = data.slice(startIndex, lineEnd);

			if (line.trim()) {
				try {
					messages.push(JSON.parse(line));
				} catch {
					logger.warn("[TerminalHostClient] Failed to parse NDJSON line");
				}
			}

			startIndex = newlineIndex + 1;
			newlineIndex = data.indexOf("\n", startIndex);
		}

		// Save any remaining data after the last newline
		if (startIndex < data.length) {
			this.remainder = data.slice(startIndex);
		}

		return messages;
	}
}

/**
 * Serialize an outgoing message to a single NDJSON line (trailing newline).
 *
 * Mirrors the inline `${JSON.stringify(message)}\n` framing used when writing
 * to the daemon sockets.
 */
export function serializeMessage(message: unknown): string {
	return `${JSON.stringify(message)}\n`;
}
