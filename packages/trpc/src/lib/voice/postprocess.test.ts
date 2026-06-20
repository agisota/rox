import { describe, expect, test } from "bun:test";
import { buildSystemPrompt, parseJsonObject } from "./postprocess";

describe("buildSystemPrompt (voice post-process context)", () => {
	test("returns the base prompt when no context is supplied", () => {
		const base = buildSystemPrompt();
		expect(base).toContain("улучшаешь промпт");
		expect(base).not.toContain("Контекст от пользователя");
	});

	test("ignores empty/whitespace context", () => {
		expect(buildSystemPrompt("   ")).toBe(buildSystemPrompt());
	});

	test("appends the user context when present", () => {
		const prompt = buildSystemPrompt("Проект Set, отвечай по-русски");
		expect(prompt).toContain("Контекст от пользователя");
		expect(prompt).toContain("Проект Set, отвечай по-русски");
	});
});

describe("parseJsonObject (voice post-process)", () => {
	test("parses a ru/en object", () => {
		expect(parseJsonObject('{"ru":"привет","en":"hi"}')).toEqual({
			ru: "привет",
			en: "hi",
		});
	});

	test("strips ```json fences", () => {
		expect(parseJsonObject('```json\n{"ru":"а","en":"b"}\n```')).toEqual({
			ru: "а",
			en: "b",
		});
	});

	test("extracts object from surrounding prose", () => {
		expect(parseJsonObject('Result:\n{"ru":"x","en":"y"}\nok')).toEqual({
			ru: "x",
			en: "y",
		});
	});

	test("throws on a non-object reply", () => {
		expect(() => parseJsonObject("no json here")).toThrow("not a JSON object");
	});
});
