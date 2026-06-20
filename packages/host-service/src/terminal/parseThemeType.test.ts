// Unit tests for the pure `parseThemeType` helper. It narrows arbitrary
// query/body string input down to the terminal env's "dark" | "light"
// theme literal (or undefined for anything else), so a malformed/missing
// `themeType` from a request never reaches buildV2TerminalEnv. Pure,
// offline — no daemon, socket, or module state involved.

import { describe, expect, test } from "bun:test";
import { parseThemeType } from "./terminal.ts";

describe("parseThemeType", () => {
	test('returns "dark" for the literal "dark"', () => {
		expect(parseThemeType("dark")).toBe("dark");
	});

	test('returns "light" for the literal "light"', () => {
		expect(parseThemeType("light")).toBe("light");
	});

	test("returns undefined for null", () => {
		expect(parseThemeType(null)).toBeUndefined();
	});

	test("returns undefined for undefined", () => {
		expect(parseThemeType(undefined)).toBeUndefined();
	});

	test("returns undefined for an empty string", () => {
		expect(parseThemeType("")).toBeUndefined();
	});

	test("returns undefined for an unrecognized theme value", () => {
		expect(parseThemeType("solarized")).toBeUndefined();
	});

	test("is case-sensitive — uppercase variants are rejected", () => {
		expect(parseThemeType("Dark")).toBeUndefined();
		expect(parseThemeType("LIGHT")).toBeUndefined();
	});

	test("rejects values with surrounding whitespace", () => {
		expect(parseThemeType(" dark")).toBeUndefined();
		expect(parseThemeType("light ")).toBeUndefined();
	});
});
