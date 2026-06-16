/**
 * Read a chat session's transcript from durable-streams for server-side
 * generation — journal-memory epic.
 *
 * The desktop writes harness events (SSE/NDJSON) into
 * `${DURABLE_STREAMS_URL}/sessions/${sessionId}`. There is no Neon messages
 * table, so a daily Journal/Memory job reads the whole stream from offset 0,
 * extracts human-readable text best-effort, and budgets it to a character
 * ceiling that fits inside R1's context window alongside the prompt + output.
 *
 * Extraction is intentionally defensive: unknown event shapes are skipped, not
 * thrown, and a missing/expired stream yields an empty string so one bad session
 * never fails the whole day's generation.
 */

import { env } from "@/env";

// ~4 chars/token ⇒ ~12k tokens, well within R1's 131k context with headroom for
// the system prompt and JSON output.
const DEFAULT_MAX_CHARS = 48_000;

const TEXT_FIELDS = ["content", "text", "delta", "message", "value"] as const;

export function sessionStreamUrl(sessionId: string): string {
	return `${env.DURABLE_STREAMS_URL}/sessions/${sessionId}`;
}

/** Recursively collect text-bearing fields from a parsed event value. */
function collectText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) {
		return value.map(collectText).filter(Boolean).join("\n");
	}
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const out: string[] = [];
		for (const key of TEXT_FIELDS) {
			if (key in obj) {
				const text = collectText(obj[key]);
				if (text) out.push(text);
			}
		}
		return out.join("\n");
	}
	return "";
}

/**
 * Pull human-readable text out of a raw durable-stream body. Strips SSE `data:`
 * prefixes, JSON-parses each line and collects text fields; non-JSON lines pass
 * through as-is. Best-effort — malformed lines are ignored.
 */
export function extractTranscriptText(rawBody: string): string {
	const parts: string[] = [];
	for (const lineRaw of rawBody.split(/\r?\n/)) {
		const line = lineRaw.replace(/^data:\s*/, "").trim();
		if (!line || line === "[DONE]") continue;
		if (!line.startsWith("{") && !line.startsWith("[")) {
			parts.push(line);
			continue;
		}
		try {
			const text = collectText(JSON.parse(line));
			if (text) parts.push(text);
		} catch {
			// Non-JSON noise (partial chunk, comment line) — skip.
		}
	}
	return parts.join("\n").trim();
}

/**
 * Truncate a transcript to a character ceiling, keeping the most recent tail
 * (the latest exchanges matter most for a daily reflection). Returns the input
 * unchanged when already within budget.
 */
export function budgetTranscript(
	text: string,
	maxChars = DEFAULT_MAX_CHARS,
): string {
	if (text.length <= maxChars) return text;
	return `…(обрезано)\n${text.slice(text.length - maxChars)}`;
}

export interface ReadTranscriptOptions {
	maxChars?: number;
	signal?: AbortSignal;
}

/**
 * Fetch a session's transcript from durable-streams and return budgeted,
 * human-readable text. Returns an empty string when the stream is missing/empty
 * (e.g. retention expired) so callers degrade gracefully.
 */
export async function readSessionTranscript(
	sessionId: string,
	opts: ReadTranscriptOptions = {},
): Promise<string> {
	const url = new URL(sessionStreamUrl(sessionId));
	url.searchParams.set("offset", "0");

	let response: Response;
	try {
		response = await fetch(url.toString(), {
			method: "GET",
			headers: {
				Authorization: `Bearer ${env.DURABLE_STREAMS_SECRET}`,
				Accept: "application/x-ndjson, text/event-stream, */*",
			},
			signal: opts.signal,
		});
	} catch {
		return "";
	}
	if (!response.ok) return "";

	const body = await response.text().catch(() => "");
	if (!body) return "";
	return budgetTranscript(extractTranscriptText(body), opts.maxChars);
}
