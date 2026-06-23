/**
 * Pure extractor for the subset of a Telegram `Update` we currently handle:
 * a plain text message. Returns `null` for anything else (callback queries,
 * edited messages, channel posts, photo-only messages, etc.) so callers can
 * cheaply ignore unsupported updates. No I/O.
 *
 * See https://core.telegram.org/bots/api#update for the full Update shape.
 */

export type ParsedTelegramMessage = {
	updateId: number;
	chatId: number;
	text: string;
	fromUserId: number;
	fromIsBot: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function parseTelegramUpdate(
	raw: unknown,
): ParsedTelegramMessage | null {
	if (!isRecord(raw)) return null;
	const updateId = raw.update_id;
	if (typeof updateId !== "number") return null;

	// Only top-level `message` updates are supported. `edited_message`,
	// `callback_query`, `channel_post`, etc. are intentionally ignored.
	const message = raw.message;
	if (!isRecord(message)) return null;

	const text = message.text;
	if (typeof text !== "string" || text.length === 0) return null;

	const chat = message.chat;
	if (!isRecord(chat) || typeof chat.id !== "number") return null;

	const from = message.from;
	if (!isRecord(from) || typeof from.id !== "number") return null;

	return {
		updateId,
		chatId: chat.id,
		text,
		fromUserId: from.id,
		fromIsBot: from.is_bot === true,
	};
}
