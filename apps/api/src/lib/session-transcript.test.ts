import { describe, expect, test } from "bun:test";
import { budgetTranscript, extractTranscriptText } from "./session-transcript";

describe("extractTranscriptText", () => {
	test("extracts content from NDJSON message events", () => {
		const raw = [
			'{"type":"message","message":{"role":"user","content":"привет"}}',
			'{"type":"message","message":{"role":"assistant","content":"здравствуй"}}',
		].join("\n");
		expect(extractTranscriptText(raw)).toBe("привет\nздравствуй");
	});

	test("strips SSE data: prefixes and [DONE]", () => {
		const raw = [
			'data: {"text":"одно"}',
			"data: [DONE]",
			'data: {"text":"два"}',
		].join("\n");
		expect(extractTranscriptText(raw)).toBe("одно\nдва");
	});

	test("passes through plain (non-JSON) lines", () => {
		expect(extractTranscriptText("сырой лог\nещё строка")).toBe(
			"сырой лог\nещё строка",
		);
	});

	test("collects text from delta/value fields and arrays", () => {
		const raw = '{"delta":"часть1"}\n{"content":["a","b"]}';
		expect(extractTranscriptText(raw)).toBe("часть1\na\nb");
	});

	test("ignores malformed JSON lines", () => {
		const raw = '{"text":"ok"}\n{broken json\n{"text":"ok2"}';
		expect(extractTranscriptText(raw)).toBe("ok\nok2");
	});

	test("returns empty string for empty input", () => {
		expect(extractTranscriptText("")).toBe("");
	});
});

describe("budgetTranscript", () => {
	test("returns input unchanged when within budget", () => {
		expect(budgetTranscript("short", 100)).toBe("short");
	});

	test("keeps the tail and marks truncation when over budget", () => {
		const result = budgetTranscript("0123456789", 4);
		expect(result).toBe("…(обрезано)\n6789");
	});
});
