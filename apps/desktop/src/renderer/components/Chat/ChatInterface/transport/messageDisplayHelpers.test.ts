import { describe, expect, it } from "bun:test";
import {
	countFileMessages,
	type DisplayMessage,
	findLatestAssistantErrorMessage,
	getLegacyImagePayload,
	hasFileOrImagePart,
	withoutActiveTurnAssistantHistory,
} from "./messageDisplayHelpers";

const userMsg = (id: string, text: string): DisplayMessage => ({
	id,
	role: "user",
	content: [{ type: "text", text }],
});

const assistantMsg = (
	id: string,
	opts: { stopReason?: string; errorMessage?: string } = {},
): DisplayMessage => ({
	id,
	role: "assistant",
	stopReason: opts.stopReason,
	errorMessage: opts.errorMessage,
	content: [{ type: "text", text: `reply ${id}` }],
});

describe("findLatestAssistantErrorMessage", () => {
	it("returns the latest assistant error message", () => {
		const messages = [
			userMsg("u1", "hi"),
			assistantMsg("a1", { stopReason: "error", errorMessage: " boom " }),
		];
		expect(findLatestAssistantErrorMessage(messages)).toBe("boom");
	});

	it("returns null when the latest assistant turn completed cleanly", () => {
		const messages = [
			userMsg("u1", "hi"),
			assistantMsg("a1", { stopReason: "end_turn" }),
		];
		expect(findLatestAssistantErrorMessage(messages)).toBeNull();
	});
});

describe("withoutActiveTurnAssistantHistory", () => {
	it("strips the streaming assistant message from history while running", () => {
		const messages = [
			userMsg("u1", "first"),
			assistantMsg("a1", { stopReason: "end_turn" }),
			userMsg("u2", "second"),
			// in-flight assistant message committed to history mid-stream
			assistantMsg("a2"),
		];
		const result = withoutActiveTurnAssistantHistory({
			messages,
			currentMessage: { id: "a2", role: "assistant" },
			isRunning: true,
		});
		// a2 (the currently-streaming message) is dropped; prior turns kept.
		expect(result.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
	});

	it("anchors the turn boundary to the committed user message, ignoring optimistic", () => {
		const messages = [
			userMsg("u1", "first"),
			{ ...userMsg("optimistic-123", "second"), id: "optimistic-123" },
			assistantMsg("a2"),
		];
		const result = withoutActiveTurnAssistantHistory({
			messages,
			currentMessage: { id: "a2", role: "assistant" },
			isRunning: true,
		});
		// The optimistic user message must NOT be treated as the turn anchor, so
		// the streaming a2 is still removed.
		expect(result.some((m) => m.id === "a2")).toBe(false);
		expect(result.some((m) => m.id === "optimistic-123")).toBe(true);
	});

	it("returns messages unchanged when not running", () => {
		const messages = [userMsg("u1", "hi"), assistantMsg("a1")];
		expect(
			withoutActiveTurnAssistantHistory({
				messages,
				currentMessage: { id: "a1", role: "assistant" },
				isRunning: false,
			}),
		).toBe(messages);
	});
});

describe("file message helpers", () => {
	it("detects file/image parts", () => {
		expect(
			hasFileOrImagePart({
				role: "user",
				content: [{ type: "file" }],
			}),
		).toBe(true);
		expect(
			hasFileOrImagePart({ role: "user", content: [{ type: "text" }] }),
		).toBe(false);
	});

	it("counts user messages carrying files", () => {
		const messages: DisplayMessage[] = [
			{ role: "user", content: [{ type: "file" }] },
			{ role: "user", content: [{ type: "text" }] },
			{ role: "assistant", content: [{ type: "file" }] },
		];
		expect(countFileMessages(messages)).toBe(1);
	});
});

describe("getLegacyImagePayload", () => {
	it("extracts legacy image entries", () => {
		expect(
			getLegacyImagePayload({
				images: [
					{ data: "abc", mimeType: "image/png" },
					{ data: 1, mimeType: "image/png" },
				],
			}),
		).toEqual([{ data: "abc", mimeType: "image/png" }]);
	});

	it("returns [] when there are no images", () => {
		expect(getLegacyImagePayload({ content: "x" })).toEqual([]);
		expect(getLegacyImagePayload(null)).toEqual([]);
	});
});
