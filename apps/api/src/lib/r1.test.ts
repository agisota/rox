import { describe, expect, test } from "bun:test";
import { parseJsonObject } from "./r1";

describe("parseJsonObject", () => {
	test("parses a plain JSON object", () => {
		expect(parseJsonObject('{"ok":true,"n":2}')).toEqual({ ok: true, n: 2 });
	});

	test("strips ```json fences", () => {
		const raw = '```json\n{"reflection":"день","tips":[]}\n```';
		expect(parseJsonObject(raw)).toEqual({ reflection: "день", tips: [] });
	});

	test("extracts object from surrounding prose", () => {
		const raw = 'Here is the result:\n{"a":1}\nHope that helps.';
		expect(parseJsonObject(raw)).toEqual({ a: 1 });
	});

	test("parses nested arrays/objects (journal stream shape)", () => {
		const raw =
			'{"reflection":"r","learnings":[{"text":"l"}],"memorySuggestions":[{"body":"b","category":"projects"}],"tips":[{"text":"t"}]}';
		expect(parseJsonObject(raw)).toEqual({
			reflection: "r",
			learnings: [{ text: "l" }],
			memorySuggestions: [{ body: "b", category: "projects" }],
			tips: [{ text: "t" }],
		});
	});

	test("throws on non-object replies", () => {
		expect(() => parseJsonObject("no json here")).toThrow("not a JSON object");
	});
});
