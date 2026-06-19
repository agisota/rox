import { describe, expect, it } from "bun:test";
import { getErrorMessage } from "./error";

describe("getErrorMessage", () => {
	it("returns the message of an Error", () => {
		expect(getErrorMessage(new Error("boom"))).toBe("boom");
	});

	it("preserves Error subclass messages", () => {
		class CustomError extends Error {}
		expect(getErrorMessage(new CustomError("nope"))).toBe("nope");
	});

	it("stringifies non-Error values the same way String() would", () => {
		expect(getErrorMessage("oops")).toBe("oops");
		expect(getErrorMessage(42)).toBe("42");
		expect(getErrorMessage(null)).toBe("null");
		expect(getErrorMessage(undefined)).toBe("undefined");
	});

	it("stringifies plain objects via String()", () => {
		expect(getErrorMessage({ foo: 1 })).toBe("[object Object]");
	});
});
