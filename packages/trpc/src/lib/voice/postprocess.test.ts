import { describe, expect, test } from "bun:test";
import { parseJsonObject } from "./postprocess";

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
