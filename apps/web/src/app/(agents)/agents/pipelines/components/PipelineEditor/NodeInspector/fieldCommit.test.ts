import { describe, expect, test } from "bun:test";
import {
	commitNumberField,
	commitSelectField,
	commitTextField,
	SELECT_NONE,
} from "./fieldCommit";

describe("commitTextField", () => {
	test("trims and returns the value", () => {
		expect(commitTextField("  gpt-5 ", {})).toBe("gpt-5");
	});
	test("returns null for blank/whitespace (delete key)", () => {
		expect(commitTextField("", {})).toBeNull();
		expect(commitTextField("   ", {})).toBeNull();
	});
	test("clamps to maxLength", () => {
		expect(commitTextField("abcdef", { maxLength: 3 })).toBe("abc");
	});
});

describe("commitNumberField", () => {
	test("returns null for blank/non-numeric", () => {
		expect(commitNumberField("", {})).toBeNull();
		expect(commitNumberField("abc", {})).toBeNull();
	});
	test("clamps into [min,max]", () => {
		expect(commitNumberField("0", { min: 1, max: 200, step: 1 })).toBe(1);
		expect(commitNumberField("999", { min: 1, max: 200, step: 1 })).toBe(200);
	});
	test("rounds when step is an integer", () => {
		expect(commitNumberField("3.7", { min: 1, max: 200, step: 1 })).toBe(4);
	});
	test("keeps a float when step is fractional (temperature)", () => {
		expect(commitNumberField("0.7", { min: 0, max: 2, step: 0.1 })).toBe(0.7);
		expect(commitNumberField("5", { min: 0, max: 2, step: 0.1 })).toBe(2);
	});
});

describe("commitSelectField", () => {
	test("maps the NONE sentinel to null", () => {
		expect(commitSelectField(SELECT_NONE)).toBeNull();
	});
	test("passes other values through", () => {
		expect(commitSelectField("critic")).toBe("critic");
	});
});
