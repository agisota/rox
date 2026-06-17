// Pure, dependency-free parsing of Lark event-subscription payloads.
//
// Lark POSTs JSON to the configured event URL in two shapes:
//   1. URL verification (sent once when configuring the URL).
//   2. Event callback v2 (`schema: "2.0"`), the steady-state event envelope.
//
// This module never throws: any malformed / unexpected payload yields `null`
// (for unrecognised top-level shapes) or `null` field values (for missing
// nested data). The route layer is responsible for auth and side effects.
//
// AES-encrypted event mode is OUT OF SCOPE — see TODO(lark PR-2) in the route.

/** Result of parsing a Lark URL-verification challenge. */
export type LarkUrlVerification = {
	kind: "url_verification";
	challenge: string;
	token: string;
};

/** Result of parsing a Lark v2 event callback (flattened to what we consume). */
export type LarkEventEnvelope = {
	kind: "event";
	appId: string | null;
	token: string | null;
	eventType: string | null;
	chatId: string | null;
	text: string | null;
	senderOpenId: string | null;
	senderIsBot: boolean;
};

export type ParsedLarkEnvelope = LarkUrlVerification | LarkEventEnvelope;

/** Narrow `unknown` to a plain object without widening to `any`. */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** Read a string field, returning `null` when absent or wrong type. */
function readString(
	source: Record<string, unknown>,
	key: string,
): string | null {
	const value = source[key];
	return typeof value === "string" ? value : null;
}

/**
 * Safely extract the `text` field from a Lark message `content` payload.
 *
 * For text messages `content` is a JSON *string* like `{"text":"hi"}`. We parse
 * it defensively: bad JSON, non-object results, or a missing/non-string `text`
 * all yield `null` rather than throwing.
 */
function parseMessageText(content: string | null): string | null {
	if (content === null) return null;
	try {
		const parsed: unknown = JSON.parse(content);
		if (!isRecord(parsed)) return null;
		return readString(parsed, "text");
	} catch {
		return null;
	}
}

/**
 * Parse a raw Lark event payload into a discriminated union.
 *
 * Returns `null` for anything that is not a recognised Lark envelope (e.g. a
 * non-object body, or a v2 callback missing both a `header` and the legacy
 * URL-verification shape).
 */
export function parseLarkEnvelope(raw: unknown): ParsedLarkEnvelope | null {
	if (!isRecord(raw)) return null;

	// URL verification: `{ type: "url_verification", challenge, token }`.
	if (raw.type === "url_verification") {
		const challenge = readString(raw, "challenge");
		const token = readString(raw, "token");
		if (challenge === null) return null;
		return { kind: "url_verification", challenge, token: token ?? "" };
	}

	// Event callback v2: `{ schema: "2.0", header: { ... }, event: { ... } }`.
	const header = isRecord(raw.header) ? raw.header : null;
	const event = isRecord(raw.event) ? raw.event : null;
	if (header === null) return null;

	const appId = readString(header, "app_id");
	const token = readString(header, "token");
	const eventType = readString(header, "event_type");

	let chatId: string | null = null;
	let text: string | null = null;
	let senderOpenId: string | null = null;
	let senderIsBot = false;

	if (event !== null) {
		const message = isRecord(event.message) ? event.message : null;
		if (message !== null) {
			chatId = readString(message, "chat_id");
			// `content` is a JSON string; only text messages carry `{ "text": ... }`.
			text = parseMessageText(readString(message, "content"));
		}

		const sender = isRecord(event.sender) ? event.sender : null;
		if (sender !== null) {
			const senderId = isRecord(sender.sender_id) ? sender.sender_id : null;
			if (senderId !== null) {
				senderOpenId = readString(senderId, "open_id");
			}
			// Lark marks automated senders with `sender_type: "bot"` (or "app").
			const senderType = readString(sender, "sender_type");
			senderIsBot = senderType === "bot" || senderType === "app";
		}
	}

	return {
		kind: "event",
		appId,
		token,
		eventType,
		chatId,
		text,
		senderOpenId,
		senderIsBot,
	};
}
