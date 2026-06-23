import { describe, expect, test } from "bun:test";
import { parseLarkEnvelope } from "./parse-event";

describe("parseLarkEnvelope", () => {
	test("parses url_verification shape", () => {
		const result = parseLarkEnvelope({
			type: "url_verification",
			challenge: "challenge-abc",
			token: "verify-token",
		});

		expect(result).toEqual({
			kind: "url_verification",
			challenge: "challenge-abc",
			token: "verify-token",
		});
	});

	test("url_verification without a challenge is null", () => {
		const result = parseLarkEnvelope({
			type: "url_verification",
			token: "verify-token",
		});

		expect(result).toBeNull();
	});

	test("parses im.message.receive_v1 with text content", () => {
		const result = parseLarkEnvelope({
			schema: "2.0",
			header: {
				event_id: "evt-1",
				token: "verify-token",
				app_id: "cli_app123",
				event_type: "im.message.receive_v1",
				create_time: "1700000000000",
			},
			event: {
				message: {
					message_id: "om_123",
					chat_id: "oc_chat123",
					message_type: "text",
					content: JSON.stringify({ text: "hello rox" }),
				},
				sender: {
					sender_id: { open_id: "ou_user123", user_id: "u-123" },
					sender_type: "user",
				},
			},
		});

		expect(result).toEqual({
			kind: "event",
			appId: "cli_app123",
			token: "verify-token",
			eventId: "evt-1",
			eventType: "im.message.receive_v1",
			chatId: "oc_chat123",
			messageId: "om_123",
			text: "hello rox",
			senderOpenId: "ou_user123",
			senderIsBot: false,
		});
	});

	test("captures event_id and message_id for dispatch dedup + reply", () => {
		const result = parseLarkEnvelope({
			schema: "2.0",
			header: {
				event_id: "evt-dedup-1",
				token: "verify-token",
				app_id: "cli_app123",
				event_type: "im.message.receive_v1",
			},
			event: {
				message: {
					message_id: "om_reply_target",
					chat_id: "oc_chat123",
					message_type: "text",
					content: JSON.stringify({ text: "hi" }),
				},
				sender: { sender_id: { open_id: "ou_user123" }, sender_type: "user" },
			},
		});

		expect(result).not.toBeNull();
		if (result?.kind === "event") {
			expect(result.eventId).toBe("evt-dedup-1");
			expect(result.messageId).toBe("om_reply_target");
		}
	});

	test("missing event_id / message_id yield null without throwing", () => {
		const result = parseLarkEnvelope({
			schema: "2.0",
			header: {
				token: "verify-token",
				app_id: "cli_app123",
				event_type: "im.message.receive_v1",
			},
			event: {
				message: { chat_id: "oc_chat123" },
				sender: { sender_id: { open_id: "ou_user123" }, sender_type: "user" },
			},
		});

		expect(result).not.toBeNull();
		if (result?.kind === "event") {
			expect(result.eventId).toBeNull();
			expect(result.messageId).toBeNull();
		}
	});

	test("bad content JSON yields text null without throwing", () => {
		const result = parseLarkEnvelope({
			schema: "2.0",
			header: {
				app_id: "cli_app123",
				token: "verify-token",
				event_type: "im.message.receive_v1",
			},
			event: {
				message: {
					message_id: "om_123",
					chat_id: "oc_chat123",
					message_type: "text",
					content: "{not valid json",
				},
				sender: { sender_id: { open_id: "ou_user123" }, sender_type: "user" },
			},
		});

		expect(result).not.toBeNull();
		expect(result?.kind).toBe("event");
		if (result?.kind === "event") {
			expect(result.text).toBeNull();
			expect(result.chatId).toBe("oc_chat123");
		}
	});

	test("missing content yields text null", () => {
		const result = parseLarkEnvelope({
			schema: "2.0",
			header: {
				app_id: "cli_app123",
				token: "verify-token",
				event_type: "im.message.receive_v1",
			},
			event: {
				message: { message_id: "om_123", chat_id: "oc_chat123" },
				sender: { sender_id: { open_id: "ou_user123" }, sender_type: "user" },
			},
		});

		expect(result).not.toBeNull();
		if (result?.kind === "event") {
			expect(result.text).toBeNull();
		}
	});

	test("non-object input is null", () => {
		expect(parseLarkEnvelope(null)).toBeNull();
		expect(parseLarkEnvelope(undefined)).toBeNull();
		expect(parseLarkEnvelope("string")).toBeNull();
		expect(parseLarkEnvelope(42)).toBeNull();
		// An array has neither `type: "url_verification"` nor a `header`, so it
		// falls through to the event branch and is rejected as null.
		expect(parseLarkEnvelope([])).toBeNull();
	});

	test("event callback missing a header is null", () => {
		const result = parseLarkEnvelope({
			schema: "2.0",
			event: { message: { chat_id: "oc_chat123" } },
		});

		expect(result).toBeNull();
	});

	test("bot sender sets senderIsBot true", () => {
		const result = parseLarkEnvelope({
			schema: "2.0",
			header: {
				app_id: "cli_app123",
				token: "verify-token",
				event_type: "im.message.receive_v1",
			},
			event: {
				message: {
					message_id: "om_123",
					chat_id: "oc_chat123",
					message_type: "text",
					content: JSON.stringify({ text: "from a bot" }),
				},
				sender: {
					sender_id: { open_id: "ou_bot123" },
					sender_type: "bot",
				},
			},
		});

		expect(result).not.toBeNull();
		if (result?.kind === "event") {
			expect(result.senderIsBot).toBe(true);
			expect(result.text).toBe("from a bot");
		}
	});
});
