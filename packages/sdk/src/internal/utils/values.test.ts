/// <reference types="bun-types" />
import { describe, expect, it } from "bun:test";

import { RoxError } from "../../core/error";
import {
	coerceBoolean,
	coerceFloat,
	coerceInteger,
	ensurePresent,
	hasOwn,
	isAbsoluteURL,
	isEmptyObj,
	isObj,
	maybeCoerceBoolean,
	maybeCoerceFloat,
	maybeCoerceInteger,
	maybeObj,
	safeJSON,
	validatePositiveInteger,
} from "./values";

/**
 * CHARACTERIZATION TESTS — pure value/coercion helpers used across the request
 * pipeline. Captures current behavior (including the RoxError throw paths)
 * before any error-model refactor.
 */

describe("isAbsoluteURL", () => {
	it("recognizes scheme-prefixed URLs", () => {
		expect(isAbsoluteURL("https://api.rox.one")).toBe(true);
		expect(isAbsoluteURL("http://localhost")).toBe(true);
		expect(isAbsoluteURL("custom+scheme.v1://x")).toBe(true);
	});

	it("treats relative paths as non-absolute", () => {
		expect(isAbsoluteURL("/api/trpc/task.list")).toBe(false);
		expect(isAbsoluteURL("task.list")).toBe(false);
		expect(isAbsoluteURL("//no-scheme")).toBe(false);
	});
});

describe("maybeObj", () => {
	it("returns the value as-is when it is an object", () => {
		const o = { a: 1 };
		expect(maybeObj(o)).toBe(o);
	});

	it("returns an empty object for non-objects", () => {
		expect(maybeObj(42)).toEqual({});
		expect(maybeObj("str")).toEqual({});
	});

	it("returns an empty object for null (typeof null === 'object')", () => {
		expect(maybeObj(null)).toEqual({});
	});
});

describe("isEmptyObj", () => {
	it("is true for null/undefined", () => {
		expect(isEmptyObj(null)).toBe(true);
		expect(isEmptyObj(undefined)).toBe(true);
	});

	it("is true for an object with no enumerable keys", () => {
		expect(isEmptyObj({})).toBe(true);
	});

	it("is false when there is at least one key", () => {
		expect(isEmptyObj({ a: 1 })).toBe(false);
	});
});

describe("hasOwn", () => {
	it("detects own properties", () => {
		expect(hasOwn({ a: 1 }, "a")).toBe(true);
		expect(hasOwn({ a: 1 }, "b")).toBe(false);
	});

	it("does not count inherited properties", () => {
		expect(hasOwn({}, "toString")).toBe(false);
	});
});

describe("isObj", () => {
	it("is true for plain objects", () => {
		expect(isObj({})).toBe(true);
		expect(isObj({ a: 1 })).toBe(true);
	});

	it("is false for arrays, null, and primitives", () => {
		expect(isObj([])).toBe(false);
		expect(isObj(null)).toBe(false);
		expect(isObj(1)).toBe(false);
		expect(isObj("x")).toBe(false);
		expect(isObj(undefined)).toBe(false);
	});
});

describe("ensurePresent", () => {
	it("returns the value when present", () => {
		expect(ensurePresent(0)).toBe(0);
		expect(ensurePresent("")).toBe("");
		expect(ensurePresent(false)).toBe(false);
	});

	it("throws a RoxError for null and undefined", () => {
		expect(() => ensurePresent(null)).toThrow(RoxError);
		expect(() => ensurePresent(undefined)).toThrow(RoxError);
		expect(() => ensurePresent(null)).toThrow(
			"Expected a value to be given but received null instead.",
		);
	});
});

describe("validatePositiveInteger", () => {
	it("returns the integer when valid", () => {
		expect(validatePositiveInteger("timeout", 0)).toBe(0);
		expect(validatePositiveInteger("timeout", 5000)).toBe(5000);
	});

	it("throws for non-integers", () => {
		expect(() => validatePositiveInteger("timeout", 1.5)).toThrow(
			"timeout must be an integer",
		);
		expect(() => validatePositiveInteger("timeout", "5")).toThrow(RoxError);
	});

	it("throws for negative integers", () => {
		expect(() => validatePositiveInteger("timeout", -1)).toThrow(
			"timeout must be a positive integer",
		);
	});
});

describe("coerceInteger", () => {
	it("rounds numbers", () => {
		expect(coerceInteger(4)).toBe(4);
		expect(coerceInteger(4.6)).toBe(5);
	});

	it("parses base-10 strings", () => {
		expect(coerceInteger("42")).toBe(42);
		expect(coerceInteger("42px")).toBe(42);
	});

	it("throws a RoxError for non-coercible types", () => {
		expect(() => coerceInteger(true)).toThrow(RoxError);
		expect(() => coerceInteger(null)).toThrow(RoxError);
	});
});

describe("coerceFloat", () => {
	it("returns numbers unchanged and parses strings", () => {
		expect(coerceFloat(3.14)).toBe(3.14);
		expect(coerceFloat("2.5")).toBe(2.5);
	});

	it("throws a RoxError for non-coercible types", () => {
		expect(() => coerceFloat({})).toThrow(RoxError);
	});
});

describe("coerceBoolean", () => {
	it("returns booleans unchanged", () => {
		expect(coerceBoolean(true)).toBe(true);
		expect(coerceBoolean(false)).toBe(false);
	});

	it("treats only the literal string 'true' as true", () => {
		expect(coerceBoolean("true")).toBe(true);
		expect(coerceBoolean("false")).toBe(false);
		expect(coerceBoolean("TRUE")).toBe(false);
	});

	it("uses Boolean() for other values", () => {
		expect(coerceBoolean(1)).toBe(true);
		expect(coerceBoolean(0)).toBe(false);
		expect(coerceBoolean(null)).toBe(false);
	});
});

describe("maybeCoerce* nullish passthrough", () => {
	it("returns undefined for null/undefined inputs", () => {
		expect(maybeCoerceInteger(null)).toBeUndefined();
		expect(maybeCoerceInteger(undefined)).toBeUndefined();
		expect(maybeCoerceFloat(null)).toBeUndefined();
		expect(maybeCoerceBoolean(null)).toBeUndefined();
	});

	it("coerces present values", () => {
		expect(maybeCoerceInteger("7")).toBe(7);
		expect(maybeCoerceFloat("1.5")).toBe(1.5);
		expect(maybeCoerceBoolean("true")).toBe(true);
	});
});

describe("safeJSON", () => {
	it("parses valid JSON", () => {
		expect(safeJSON('{"a":1}')).toEqual({ a: 1 });
		expect(safeJSON("123")).toBe(123);
	});

	it("returns undefined for invalid JSON instead of throwing", () => {
		expect(safeJSON("not json")).toBeUndefined();
		expect(safeJSON("")).toBeUndefined();
	});
});
