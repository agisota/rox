import { describe, expect, it } from "bun:test";
import type { ChatSendMessageInput } from "../sendMessage";
import {
	type ChatHistoryMessage,
	hasMatchingUserMessage,
	toOptimisticUserMessage,
} from "./optimisticUserMessage";

/**
 * Characterization tests for the V2 WorkspaceChatInterface optimistic message
 * builder. This copy is byte-identical to the legacy ChatPaneInterface util
 * apart from its `UseChatDisplayReturn` import source, so locking both ahead of
 * the #737 merge proves the surviving file keeps the exact same behavior.
 */

function input(
	content: string,
	files?: ChatSendMessageInput["payload"]["files"],
): ChatSendMessageInput {
	return {
		payload: { content, files },
		metadata: {},
	};
}

// Narrow through a local structural shape: the util types `content` as the
// renderer display-message union, which this isolated test cannot import without
// dragging in the chat display hook.
type AnyPart = {
	type: string;
	text?: string;
	data?: string;
	mediaType?: string;
	filename?: string;
};
function parts(message: ChatHistoryMessage): AnyPart[] {
	return (message as unknown as { content: AnyPart[] }).content;
}

describe("toOptimisticUserMessage", () => {
	it("returns null when there is no text and no files", () => {
		expect(toOptimisticUserMessage(input(""))).toBeNull();
		expect(toOptimisticUserMessage(input("   "))).toBeNull();
		expect(toOptimisticUserMessage(input("", []))).toBeNull();
	});

	it("builds a user message with a single text part for plain text", () => {
		const message = toOptimisticUserMessage(input("hello bos"));
		expect(message).not.toBeNull();
		expect(message?.role).toBe("user");
		expect(parts(message as ChatHistoryMessage)).toEqual([
			{ type: "text", text: "hello bos" },
		]);
	});

	it("trims surrounding whitespace from the text part", () => {
		const message = toOptimisticUserMessage(input("  spaced  "));
		expect(parts(message as ChatHistoryMessage)).toEqual([
			{ type: "text", text: "spaced" },
		]);
	});

	it("builds file parts carrying type/data/mediaType/filename", () => {
		const message = toOptimisticUserMessage(
			input("look", [
				{ data: "BASE64", mediaType: "image/png", filename: "shot.png" },
			]),
		);
		const messageParts = parts(message as ChatHistoryMessage);
		expect(messageParts).toEqual([
			{ type: "text", text: "look" },
			{
				type: "file",
				data: "BASE64",
				mediaType: "image/png",
				filename: "shot.png",
			},
		]);
	});

	it("emits only file parts when content is empty but files exist", () => {
		const message = toOptimisticUserMessage(
			input("", [
				{ data: "D", mediaType: "application/pdf", filename: "a.pdf" },
			]),
		);
		expect(message).not.toBeNull();
		const messageParts = parts(message as ChatHistoryMessage);
		expect(messageParts).toHaveLength(1);
		expect(messageParts[0]?.type).toBe("file");
	});

	it("prefixes the id with 'optimistic-' and sets role 'user'", () => {
		const message = toOptimisticUserMessage(input("hey"));
		expect(message?.id).toMatch(/^optimistic-/);
		expect(message?.role).toBe("user");
	});

	it("produces a unique id per call", () => {
		const first = toOptimisticUserMessage(input("hey"));
		const second = toOptimisticUserMessage(input("hey"));
		expect(first?.id).not.toBe(second?.id);
	});

	it("sets createdAt to a Date", () => {
		const message = toOptimisticUserMessage(input("hey"));
		expect(message?.createdAt).toBeInstanceOf(Date);
	});
});

describe("hasMatchingUserMessage", () => {
	it("matches an identical text signature already in the list", () => {
		const candidate = toOptimisticUserMessage(
			input("whats your model?"),
		) as ChatHistoryMessage;
		const persisted = toOptimisticUserMessage(
			input("whats your model?"),
		) as ChatHistoryMessage;

		expect(hasMatchingUserMessage({ messages: [persisted], candidate })).toBe(
			true,
		);
	});

	it("matches a file signature (mediaType:filename:data)", () => {
		const file = { data: "D1", mediaType: "image/png", filename: "x.png" };
		const candidate = toOptimisticUserMessage(
			input("", [file]),
		) as ChatHistoryMessage;
		const persisted = toOptimisticUserMessage(
			input("", [file]),
		) as ChatHistoryMessage;

		expect(hasMatchingUserMessage({ messages: [persisted], candidate })).toBe(
			true,
		);
	});

	it("returns false when no message in the list matches", () => {
		const candidate = toOptimisticUserMessage(
			input("unique question"),
		) as ChatHistoryMessage;
		const other = toOptimisticUserMessage(
			input("different question"),
		) as ChatHistoryMessage;

		expect(hasMatchingUserMessage({ messages: [other], candidate })).toBe(
			false,
		);
	});

	it("returns false for a non-user candidate (no signature)", () => {
		const assistantCandidate = {
			id: "a1",
			role: "assistant",
			content: [{ type: "text", text: "hi" }],
			createdAt: new Date(),
		} as unknown as ChatHistoryMessage;

		expect(
			hasMatchingUserMessage({
				messages: [assistantCandidate],
				candidate: assistantCandidate,
			}),
		).toBe(false);
	});

	it("returns false against an empty message list", () => {
		const candidate = toOptimisticUserMessage(
			input("anything"),
		) as ChatHistoryMessage;

		expect(hasMatchingUserMessage({ messages: [], candidate })).toBe(false);
	});
});
