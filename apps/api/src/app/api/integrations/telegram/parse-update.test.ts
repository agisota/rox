import { describe, expect, test } from "bun:test";
import { parseTelegramUpdate } from "./parse-update";

describe("parseTelegramUpdate", () => {
	test("parses a normal human text message", () => {
		const result = parseTelegramUpdate({
			update_id: 1,
			message: {
				message_id: 10,
				text: "hello rox",
				chat: { id: 555, type: "private" },
				from: { id: 999, is_bot: false, first_name: "Mark" },
			},
		});

		expect(result).toEqual({
			updateId: 1,
			chatId: 555,
			text: "hello rox",
			fromUserId: 999,
			fromIsBot: false,
		});
	});

	test("flags a bot sender via fromIsBot", () => {
		const result = parseTelegramUpdate({
			update_id: 2,
			message: {
				message_id: 11,
				text: "I am a bot",
				chat: { id: 1, type: "private" },
				from: { id: 2, is_bot: true },
			},
		});

		expect(result?.fromIsBot).toBe(true);
	});

	test("defaults fromIsBot to false when is_bot is absent", () => {
		const result = parseTelegramUpdate({
			update_id: 12,
			message: {
				text: "no is_bot field",
				chat: { id: 1 },
				from: { id: 2 },
			},
		});

		expect(result?.fromIsBot).toBe(false);
	});

	test("returns null for a callback_query update (no message)", () => {
		const result = parseTelegramUpdate({
			update_id: 3,
			callback_query: { id: "cb", data: "click" },
		});

		expect(result).toBeNull();
	});

	test("returns null for an edited_message update", () => {
		const result = parseTelegramUpdate({
			update_id: 4,
			edited_message: {
				text: "edited",
				chat: { id: 1 },
				from: { id: 2, is_bot: false },
			},
		});

		expect(result).toBeNull();
	});

	test("returns null for an empty/whitespaceless message (no text)", () => {
		const result = parseTelegramUpdate({
			update_id: 5,
			message: {
				message_id: 12,
				chat: { id: 1 },
				from: { id: 2, is_bot: false },
				photo: [{ file_id: "abc" }],
			},
		});

		expect(result).toBeNull();
	});

	test("returns null for an empty-string text", () => {
		const result = parseTelegramUpdate({
			update_id: 6,
			message: { text: "", chat: { id: 1 }, from: { id: 2 } },
		});

		expect(result).toBeNull();
	});

	test("returns null for non-object input", () => {
		expect(parseTelegramUpdate(null)).toBeNull();
		expect(parseTelegramUpdate(undefined)).toBeNull();
		expect(parseTelegramUpdate("string")).toBeNull();
		expect(parseTelegramUpdate(42)).toBeNull();
	});

	test("returns null when chat.id is missing or not a number", () => {
		expect(
			parseTelegramUpdate({
				update_id: 7,
				message: { text: "hi", chat: {}, from: { id: 2 } },
			}),
		).toBeNull();
		expect(
			parseTelegramUpdate({
				update_id: 8,
				message: { text: "hi", chat: { id: "555" }, from: { id: 2 } },
			}),
		).toBeNull();
	});

	test("returns null when from.id is missing", () => {
		expect(
			parseTelegramUpdate({
				update_id: 9,
				message: { text: "hi", chat: { id: 1 }, from: {} },
			}),
		).toBeNull();
	});

	test("returns null when update_id is missing", () => {
		expect(
			parseTelegramUpdate({
				message: {
					text: "hi",
					chat: { id: 1 },
					from: { id: 2, is_bot: false },
				},
			}),
		).toBeNull();
	});
});
