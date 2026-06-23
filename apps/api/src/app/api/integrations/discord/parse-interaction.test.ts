import { describe, expect, test } from "bun:test";
import { parseDiscordInteraction } from "./parse-interaction";

describe("parseDiscordInteraction", () => {
	test("parses a PING interaction", () => {
		const result = parseDiscordInteraction({ type: 1 });
		expect(result).toEqual({
			id: null,
			type: 1,
			token: null,
			applicationId: null,
			guildId: null,
			channelId: null,
			userId: null,
			commandName: null,
			text: null,
		});
	});

	test("parses a slash command with options and member.user", () => {
		const result = parseDiscordInteraction({
			id: "interaction-1",
			type: 2,
			token: "interaction-token",
			application_id: "app-1",
			guild_id: "guild-123",
			channel_id: "channel-456",
			member: { user: { id: "user-789" } },
			data: {
				name: "ask",
				options: [{ name: "prompt", value: "what is rox?" }],
			},
		});

		expect(result).toEqual({
			id: "interaction-1",
			type: 2,
			token: "interaction-token",
			applicationId: "app-1",
			guildId: "guild-123",
			channelId: "channel-456",
			userId: "user-789",
			commandName: "ask",
			text: "what is rox?",
		});
	});

	test("captures id, token, and application_id for the follow-up edit", () => {
		const result = parseDiscordInteraction({
			id: "987654321",
			type: 2,
			token: "aW50ZXJhY3Rpb24tdG9rZW4",
			application_id: "123456789",
			data: { name: "ask" },
		});

		expect(result?.id).toBe("987654321");
		expect(result?.token).toBe("aW50ZXJhY3Rpb24tdG9rZW4");
		expect(result?.applicationId).toBe("123456789");
	});

	test("reads userId from top-level user in DM context", () => {
		const result = parseDiscordInteraction({
			type: 2,
			channel_id: "dm-channel",
			user: { id: "dm-user" },
			data: { name: "ping" },
		});

		expect(result?.userId).toBe("dm-user");
		expect(result?.guildId).toBeNull();
		expect(result?.text).toBeNull();
	});

	test("skips non-string option values and takes the first string option", () => {
		const result = parseDiscordInteraction({
			type: 2,
			data: {
				name: "ask",
				options: [
					{ name: "count", value: 5 },
					{ name: "prompt", value: "hello" },
				],
			},
		});

		expect(result?.text).toBe("hello");
	});

	test("returns nulls for missing fields", () => {
		const result = parseDiscordInteraction({ type: 3 });
		expect(result).toEqual({
			id: null,
			type: 3,
			token: null,
			applicationId: null,
			guildId: null,
			channelId: null,
			userId: null,
			commandName: null,
			text: null,
		});
	});

	test("returns null for non-object input", () => {
		expect(parseDiscordInteraction(null)).toBeNull();
		expect(parseDiscordInteraction("string")).toBeNull();
		expect(parseDiscordInteraction(42)).toBeNull();
		expect(parseDiscordInteraction([])).toBeNull();
		expect(parseDiscordInteraction(undefined)).toBeNull();
	});

	test("returns null when type is missing or not a number", () => {
		expect(parseDiscordInteraction({})).toBeNull();
		expect(parseDiscordInteraction({ type: "2" })).toBeNull();
	});
});
