import { describe, expect, test } from "bun:test";
import type { ChatCompletionResult } from "../chat/utils/chat-completion";
import { shapeEditPromptResult, stripCodeFence } from "./edit-prompt-helpers";

describe("stripCodeFence", () => {
	test("strips a ```text fenced block", () => {
		expect(stripCodeFence("```text\nИщи сбои в $sentry\n```")).toBe(
			"Ищи сбои в $sentry",
		);
	});

	test("strips a bare ``` fenced block", () => {
		expect(stripCodeFence("```\nhello world\n```")).toBe("hello world");
	});

	test("leaves un-fenced text untouched (only trims)", () => {
		expect(stripCodeFence("  no fence here  ")).toBe("no fence here");
	});

	test("trims leading/trailing whitespace around a fence", () => {
		expect(stripCodeFence("  \n```md\nbody\n```  \n")).toBe("body");
	});

	test("preserves inner ``` that is not a wrapping fence", () => {
		// A lone ``` inside content (no closing wrap) is not stripped.
		const reply = "line one\n```\nstill body";
		expect(stripCodeFence(reply)).toBe("line one\n```\nstill body");
	});

	test("keeps multi-line body inside a fence", () => {
		expect(stripCodeFence("```\nline 1\nline 2\n```")).toBe("line 1\nline 2");
	});
});

describe("shapeEditPromptResult", () => {
	const current = "Старый промпт";

	test("ok + fenced reply → unfenced trimmed prompt, local: false", () => {
		const result: ChatCompletionResult = {
			status: "ok",
			reply: "```text\nНовый промпт\n```",
		};
		expect(shapeEditPromptResult(result, current)).toEqual({
			prompt: "Новый промпт",
			note: "Промпт перегенерирован моделью.",
			local: false,
		});
	});

	test("ok + plain reply → trimmed prompt, local: false", () => {
		const result: ChatCompletionResult = {
			status: "ok",
			reply: "  Просто текст  ",
		};
		expect(shapeEditPromptResult(result, current)).toEqual({
			prompt: "Просто текст",
			note: "Промпт перегенерирован моделью.",
			local: false,
		});
	});

	test("ok + empty/whitespace reply → local fallback", () => {
		const result: ChatCompletionResult = { status: "ok", reply: "   \n  " };
		expect(shapeEditPromptResult(result, current)).toEqual({
			prompt: current,
			note: "",
			local: true,
		});
	});

	test("needs-user-key → local fallback with current prompt", () => {
		const result: ChatCompletionResult = { status: "needs-user-key" };
		expect(shapeEditPromptResult(result, current)).toEqual({
			prompt: current,
			note: "",
			local: true,
		});
	});

	test("not-configured → local fallback with current prompt", () => {
		const result: ChatCompletionResult = { status: "not-configured" };
		expect(shapeEditPromptResult(result, current)).toEqual({
			prompt: current,
			note: "",
			local: true,
		});
	});
});
